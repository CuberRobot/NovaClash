import asyncio
import json
import random
import string

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from game_service import build_team_from_selection, create_player_pools, run_battle_from_teams


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")


def _room_code():
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))


class Room(object):
    def __init__(self, code):
        self.code = code
        self.players = []  # [{ws, name, pool, pending_submission}]
        self.lock = asyncio.Lock()
        self.best_of = 3
        self.round = 0
        self.score = [0, 0]
        self.is_random = False
        # 每个玩家在整把游戏中固定使用同一角色池
        self.pools = [None, None]

    def is_full(self):
        return len(self.players) >= 2

    def is_ready(self):
        return len(self.players) == 2


ROOMS = {}
ROOMS_LOCK = asyncio.Lock()


async def ws_send(ws, payload):
    await ws.send_text(json.dumps(payload, ensure_ascii=False))


async def broadcast(room, payload):
    for p in list(room.players):
        try:
            await ws_send(p["ws"], payload)
        except Exception:
            pass


def event_to_text(evt):
    t = evt[0]
    if t == "FIRST_STRIKE":
        return "先手：玩家%d" % (evt[1] + 1)
    if t == "CURSE_REMOVE_TAG":
        _, team_i, caster, enemy_i, target = evt
        return "玩家%d的%s剥夺了玩家%d的%s的标签" % (team_i + 1, caster, enemy_i + 1, target)
    if t == "ROUND":
        return "=== 回合 %d ===" % evt[1]
    if t == "POISON_TICK":
        _, team_i, name, dmg, hp_after = evt
        return "%s受到中毒伤害%d点（HP=%d）" % (name, dmg, hp_after)
    if t == "POISON_APPLY":
        _, atk_team, atk_name, def_team, def_name, pdmg, turns = evt
        return "%s使%s中毒（每回合%d点，持续%d回合）" % (atk_name, def_name, pdmg, turns)
    if t == "SKIP_DEAD":
        _, team_i, name = evt
        return "玩家%d的%s已死亡，跳过攻击" % (team_i + 1, name)
    if t == "SELF_DESTRUCT":
        _, team_i, name = evt
        return "玩家%d的%s发动自爆（自爆后自身死亡）" % (team_i + 1, name)
    if t == "SHIELD_TRANSFER":
        _, team_i, shield_name, protected_name, transfer, left = evt
        return "%s为%s分担了%d点伤害（护盾剩余%d次）" % (shield_name, protected_name, transfer, left)
    if t == "ARMOR_REDUCE":
        _, team_i, name, before, after = evt
        return "%s触发重装减伤（%d -> %d）" % (name, before, after)
    if t == "PIERCE":
        _, atk_team, atk_name, def_team, def_name, dmg = evt
        return "%s触发穿透，追加攻击%s（伤害=%d）" % (atk_name, def_name, dmg)
    if t == "AOE_HIT":
        _, atk_team, atk_name, def_team, def_name, dmg = evt
        return "玩家%d的%s对玩家%d的%s造成群体伤害（伤害=%d）" % (
            atk_team + 1,
            atk_name,
            def_team + 1,
            def_name,
            dmg,
        )
    if t == "HIT":
        _, atk_team, atk_name, def_team, def_name, dmg, hp_after = evt
        return "玩家%d的%s攻击玩家%d的%s，造成%d伤害（目标HP=%d）" % (
            atk_team + 1,
            atk_name,
            def_team + 1,
            def_name,
            dmg,
            hp_after,
        )
    if t == "DIE":
        _, team_i, name, cause = evt
        if cause == "poison":
            return "%s因中毒死亡" % name
        return "%s阵亡" % name
    if t == "REVIVE":
        _, team_i, name, hp_after, left = evt
        return "%s被复活（HP=%d，复活剩余次数=%d）" % (name, hp_after, left)
    return ""


async def _start_next_round(room):
    # 保护：正常情况下最多 3 回合，对超过上限的情况给出错误提示
    if room.round >= 3:
        await broadcast(
            room,
            {
                "type": "error",
                "message": "对局回合数超过 3（best-of-3），请检查状态或重新开始。",
            },
        )
        return

    room.round += 1

    # 整把游戏内角色池固定：首次开局时生成，后续回合复用
    if room.pools[0] is None or room.pools[1] is None:
        pool1, pool2 = create_player_pools()
        room.pools[0] = pool1
        room.pools[1] = pool2
    else:
        pool1, pool2 = room.pools

    room.players[0]["pool"] = pool1
    room.players[1]["pool"] = pool2
    room.players[0]["submission"] = None
    room.players[1]["submission"] = None

    await ws_send(
        room.players[0]["ws"],
        {"type": "round_start", "round": room.round, "pool": pool1, "score": room.score},
    )
    await ws_send(
        room.players[1]["ws"],
        {"type": "round_start", "round": room.round, "pool": pool2, "score": room.score},
    )


async def _try_resolve_round(room):
    if not room.is_ready():
        return
    if room.players[0].get("submission") is None or room.players[1].get("submission") is None:
        return

    sub1 = room.players[0]["submission"]
    sub2 = room.players[1]["submission"]

    try:
        team1 = build_team_from_selection(room.players[0]["pool"], sub1["selection"], sub1["gains"])
    except Exception as e:
        await ws_send(room.players[0]["ws"], {"type": "error", "message": str(e)})
        room.players[0]["submission"] = None
        return

    try:
        team2 = build_team_from_selection(room.players[1]["pool"], sub2["selection"], sub2["gains"])
    except Exception as e:
        await ws_send(room.players[1]["ws"], {"type": "error", "message": str(e)})
        room.players[1]["submission"] = None
        return

    strategy1 = sub1.get("strategy")
    strategy2 = sub2.get("strategy")
    result = run_battle_from_teams(team1, team2, strategy1=strategy1, strategy2=strategy2)
    winner = int(result["winner"])  # 0/1
    room.score[winner] += 1

    texts = []
    for evt in result["events"]:
        txt = event_to_text(evt)
        if txt:
            texts.append(txt)

    await broadcast(
        room,
        {
            "type": "round_result",
            "round": room.round,
            "events": result["events"],
            "texts": texts,
            "winner": winner + 1,
            "score": room.score,
        },
    )

    if max(room.score) >= 2 or room.round >= 3:
        final_winner = 1 if room.score[0] > room.score[1] else 2
        await broadcast(room, {"type": "match_end", "winner": final_winner, "score": room.score})
        # 决出最终胜者后让双方都退出房间（不显示“对方离开”的提示）
        code = room.code
        players_copy = list(room.players)
        room.players.clear()
        async with ROOMS_LOCK:
            try:
                del ROOMS[code]
            except KeyError:
                pass
        for p in players_copy:
            try:
                await ws_send(p["ws"], {"type": "left_room", "reason": "match_end"})
            except Exception:
                pass
        return

    await _start_next_round(room)


async def _join_random(ws, name):
    """
    随机匹配：只负责查找/创建一个可用的随机房间，并把房间号返回给前端。
    实际加入房间仍然通过 join_room 完成。
    """
    async with ROOMS_LOCK:
        target_room = None
        for room in ROOMS.values():
            if getattr(room, "is_random", False) and not room.is_full():
                target_room = room
                break

        if target_room is None:
            code = _room_code()
            target_room = Room(code)
            target_room.is_random = True
            ROOMS[code] = target_room
            mode = "wait"
        else:
            code = target_room.code
            mode = "found"

    if mode == "wait":
        # 告知前端：已创建随机房间，等待对手；前端再调用 join_room 进入房间
        await ws_send(ws, {"type": "match_wait", "room": code})
    else:
        # 告知前端：找到已有随机房间；前端再调用 join_room 进入房间
        await ws_send(ws, {"type": "match_found", "room": code})

    return None


async def _join_room(ws, name, code):
    if not code:
        code = _room_code()
    code = code.upper()

    room = ROOMS.get(code)
    if room is None:
        room = Room(code)
        ROOMS[code] = room

    async with room.lock:
        # 防止同一个连接多次加入同一房间
        for idx, p in enumerate(room.players):
            if p["ws"] is ws:
                await ws_send(ws, {"type": "error", "message": "你已经在该房间中"})
                return room

        if room.is_full():
            await ws_send(ws, {"type": "error", "message": "房间已满"})
            return None
        room.players.append({"ws": ws, "name": name, "pool": None, "submission": None})
        player_no = len(room.players)

    await ws_send(ws, {"type": "joined", "room": code, "player": player_no})

    if room.is_ready():
        await ws_send(room.players[0]["ws"], {"type": "matched", "room": code, "player": 1, "opponent": room.players[1]["name"]})
        await ws_send(room.players[1]["ws"], {"type": "matched", "room": code, "player": 2, "opponent": room.players[0]["name"]})
        await _start_next_round(room)
    else:
        await ws_send(ws, {"type": "waiting", "mode": "room", "room": code})

    return room


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    room = None
    try:
        while True:
            msg = await ws.receive_text()
            data = json.loads(msg)
            t = data.get("type")

            # 若房间已被删除（例如对方离开导致清空），则本连接视为已不在任何房间，可重新匹配
            if room is not None:
                async with ROOMS_LOCK:
                    if room.code not in ROOMS:
                        room = None

            # 已在房间内时禁止再次匹配或加入其他房间
            if t in ("join_random", "join_room") and room is not None:
                await ws_send(
                    ws,
                    {
                        "type": "error",
                        "message": "你已经在房间中，不能再次匹配或加入。若要重新匹配，请刷新页面。",
                    },
                )
                continue

            if t == "join_random":
                name = data.get("name") or "玩家"
                room = await _join_random(ws, name)
                continue

            if t == "join_room":
                name = data.get("name") or "玩家"
                code = data.get("room") or ""
                room = await _join_room(ws, name, code)
                continue

            if t == "submit_round":
                if room is None:
                    await ws_send(ws, {"type": "error", "message": "未加入房间"})
                    continue
                r = int(data.get("round") or 0)
                selection = data.get("selection") or []
                gains = data.get("gains") or []
                gains = [tuple(g) for g in gains if isinstance(g, list) and len(g) == 2]

                if r != room.round:
                    await ws_send(ws, {"type": "error", "message": "回合号不匹配"})
                    continue

                # 找到提交者是第几位玩家
                player_index = None
                for i, p in enumerate(room.players):
                    if p["ws"] is ws:
                        player_index = i
                        break
                if player_index is None:
                    await ws_send(ws, {"type": "error", "message": "房间状态异常"})
                    continue

                strategy = data.get("strategy") or {}
                room.players[player_index]["submission"] = {
                    "selection": [int(x) for x in selection],
                    "gains": [(int(a), int(b)) for a, b in gains],
                    "strategy": strategy,
                }
                await ws_send(ws, {"type": "submitted", "round": room.round})

                # 通知对手“已提交”，方便前端更新等待状态
                for i, p in enumerate(room.players):
                    if p["ws"] is not ws:
                        await ws_send(p["ws"], {"type": "opponent_submitted", "round": room.round})

                await _try_resolve_round(room)
                continue

            if t == "leave_room":
                if room is None:
                    await ws_send(ws, {"type": "error", "message": "当前不在房间中"})
                    continue
                # 从房间中移除该玩家；对方也视为自动退出房间，并清空、删除房间
                for i, p in enumerate(room.players):
                    if p["ws"] is ws:
                        # 让留在房间内的其他玩家也收到 left_room，视为自动退出，便于前端重置并重新匹配
                        others = [op for j, op in enumerate(room.players) if j != i]
                        for op in others:
                            await ws_send(op["ws"], {"type": "left_room", "reason": "opponent_left"})
                        room.players.clear()
                        async with ROOMS_LOCK:
                            try:
                                del ROOMS[room.code]
                            except KeyError:
                                pass
                        await ws_send(ws, {"type": "left_room"})
                        room = None
                        break
                continue

            await ws_send(ws, {"type": "error", "message": "未知消息类型"})

    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await ws_send(ws, {"type": "error", "message": "服务器异常"})
        except Exception:
            pass
    finally:
        # 当前连接断开时，让同房间的其他玩家也自动退出房间并清空房间
        try:
            if room is not None:
                others = [p for p in room.players if p["ws"] is not ws]
                for op in others:
                    await ws_send(op["ws"], {"type": "left_room", "reason": "opponent_left"})
                room.players.clear()
                async with ROOMS_LOCK:
                    try:
                        del ROOMS[room.code]
                    except KeyError:
                        pass
        except Exception:
            pass
