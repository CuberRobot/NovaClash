"""
Web 版 NovaClash 服务：FastAPI + WebSocket，支持随机匹配与房间号加入。
无认证，房间与对局状态仅存内存；三局两胜，每回合双方提交选角与策略后自动结算。
"""
import asyncio
import json
import random
import string
from enum import Enum

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse, HTMLResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.staticfiles import StaticFiles

from game_service import (
    build_team_from_selection,
    create_player_pools,
    run_battle_from_teams,
)


class GameMode(str, Enum):
    """游戏模式枚举。"""
    STANDARD = "standard"
    CHAOS = "chaos"
    BIG_BATTLEFIELD = "big_battlefield"


app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    """首页返回单页应用的 HTML。"""
    return FileResponse("static/index.html")


def _room_code():
    """生成 4 位大写字母+数字的房间号。"""
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(4))


class Room(object):
    """
    单局房间：最多 2 人，三局两胜。每回合为双方下发角色池，收集提交后调用战斗逻辑结算。
    players: 列表项为 {ws, name, pool, submission}，pool 为本回合角色池，submission 为本回合已提交数据。
    """

    def __init__(self, code, mode: str = "standard"):
        self.code = code
        self.mode = mode  # "standard" / "chaos" / "big_battlefield"
        self.players = []  # [{ws, name, pool, pending_submission}]
        self.lock = asyncio.Lock()
        self.best_of = 3
        self.round = 0
        self.score = [0, 0]
        self.is_random = False  # 是否为随机匹配创建的房间
        # 每个玩家在整把游戏中固定使用同一角色池
        self.pools = [None, None]

    def is_full(self):
        return len(self.players) >= 2

    def is_ready(self):
        """两人到齐可开始对局。"""
        return len(self.players) == 2


# 全局房间表：房间号 -> Room；ROOMS_LOCK 保护增删与遍历
ROOMS = {}
ROOMS_LOCK = asyncio.Lock()


async def ws_send(ws, payload):
    """向单个 WebSocket 发送 JSON 消息（ensure_ascii=False 以正确输出中文）。"""
    await ws.send_text(json.dumps(payload, ensure_ascii=False))


async def broadcast(room, payload):
    """向房间内所有玩家发送同一条消息；单条发送失败不中断其余。"""
    for p in list(room.players):
        try:
            await ws_send(p["ws"], payload)
        except Exception:
            pass


def event_to_text(evt):
    """将战斗事件元组转为中文战报一行，与 main.event_to_text 一致。"""
    t = evt[0]
    if t == "FIRST_STRIKE":
        return "先手：玩家%d" % (evt[1] + 1)
    if t == "CURSE_REMOVE_TAG":
        _, team_i, caster, enemy_i, target = evt
        return "玩家%d的%s剥夺了玩家%d的%s的标签" % (team_i + 1, caster, enemy_i + 1, target)
    if t == "ROUND":
        return "=== 轮次 %d ===" % evt[1]
    if t == "POISON_TICK":
        _, team_i, name, dmg, hp_after = evt
        return "%s受到中毒伤害%d点（HP=%d）" % (name, dmg, hp_after)
    if t == "POISON_APPLY":
        _, atk_team, atk_name, def_team, def_name, pdmg, turns = evt
        return "%s使%s中毒（每轮次%d点，持续%d轮次）" % (atk_name, def_name, pdmg, turns)
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
    if t == "LIFE_STEAL":
        _, team_i, name, heal, hp_after = evt
        return "%s吸血恢复%d点（HP=%d）" % (name, heal, hp_after)
    if t == "REFLECT":
        _, def_team, def_name, atk_team, atk_name, dmg, hp_after = evt
        return "%s反弹%d点伤害给%s（%s HP=%d）" % (def_name, dmg, atk_name, atk_name, hp_after)
    return ""


async def _start_next_round(room):
    """
    开启下一回合：回合数+1，若本局尚未生成角色池则生成并缓存，否则复用；
    清空双方 submission，向两人分别发送 round_start（各自 pool 与当前比分）。
    """
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
        # 根据房间模式生成角色池
        if getattr(room, "mode", "standard") == "chaos":
            # 混沌模式：总标签数=4，每个角色最多 2 个标签，排除自爆步兵
            pool1, pool2 = create_player_pools(pool_size=6, mode="chaos")
        elif getattr(room, "mode", "standard") == "big_battlefield":
            # 大战场模式：9 选 5，6 次增益（使用标准角色池，只是 pool_size 更大）
            pool1, pool2 = create_player_pools(pool_size=9, mode="big_battlefield")
        else:
            # 标准模式：6 选 3，4 次增益
            pool1, pool2 = create_player_pools(pool_size=6, mode="standard")
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
    """
    当双方都已提交本回合数据时：用选角与增益构建队伍，跑战斗，更新比分，
    广播 round_result；若已有方达到 2 胜或已打满 3 局则广播 match_end 并销毁房间，否则启动下一回合。
    """
    if not room.is_ready():
        return
    if room.players[0].get("submission") is None or room.players[1].get("submission") is None:
        return

    sub1 = room.players[0]["submission"]
    sub2 = room.players[1]["submission"]

    # 根据房间模式确定 team_size
    mode = getattr(room, "mode", "standard")
    if mode == "big_battlefield":
        team_size = 5
    else:
        team_size = 3

    try:
        team1 = build_team_from_selection(room.players[0]["pool"], sub1["selection"], sub1["gains"], team_size=team_size)
    except Exception as e:
        await ws_send(room.players[0]["ws"], {"type": "error", "message": str(e)})
        room.players[0]["submission"] = None
        return

    try:
        team2 = build_team_from_selection(room.players[1]["pool"], sub2["selection"], sub2["gains"], team_size=team_size)
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


async def _join_random(ws, name, mode: str = "standard"):
    """
    随机匹配：只负责查找/创建一个可用的随机房间，并把房间号返回给前端。
    实际加入房间仍然通过 join_room 完成。
    """
    async with ROOMS_LOCK:
        target_room = None
        for room in ROOMS.values():
            # 只匹配相同模式且非满员的房间
            if getattr(room, "mode", "standard") == mode and getattr(room, "is_random", False) and not room.is_full():
                target_room = room
                break

        if target_room is None:
            code = _room_code()
            target_room = Room(code, mode=mode)
            target_room.is_random = True
            ROOMS[code] = target_room
            match_mode = "wait"
        else:
            code = target_room.code
            match_mode = "found"

    if match_mode == "wait":
        # 告知前端：已创建随机房间，等待对手；前端再调用 join_room 进入房间
        await ws_send(ws, {"type": "match_wait", "room": code})
    else:
        # 告知前端：找到已有随机房间；前端再调用 join_room 进入房间
        await ws_send(ws, {"type": "match_found", "room": code})

    return None


async def _join_room(ws, name, code, mode: str = "standard"):
    """
    加入指定房间：若 code 为空则新建房间并生成房间号；同一连接不能重复加入；
    满员返回 None。加入后若已两人则发 matched 并 _start_next_round，否则发 waiting。
    """
    if not code:
        code = _room_code()
    code = code.upper()

    room = ROOMS.get(code)
    if room is None:
        room = Room(code, mode=mode)
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
    """
    WebSocket 入口：接收 JSON 消息，按 type 分发。
    支持：join_random（随机匹配）、join_room（加入/创建房间）、submit_round（提交本回合）、leave_room（离开）。
    断线或异常时向同房间其他玩家发送 left_room(reason=opponent_left) 并清理房间。
    """
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
                mode = data.get("mode", "standard")
                room = await _join_random(ws, name, mode)
                continue

            if t == "join_room":
                name = data.get("name") or "玩家"
                code = data.get("room") or ""
                mode = data.get("mode", "standard")
                room = await _join_room(ws, name, code, mode)
                continue

            if t == "submit_round":
                # 校验房间、回合号与身份，将 selection/gains/strategy 写入对应玩家的 submission
                if room is None:
                    await ws_send(ws, {"type": "error", "message": "未加入房间"})
                    continue
                r = int(data.get("round") or 0)
                selection = data.get("selection") or []

                # 根据模式确定增益次数
                if getattr(room, "mode", "standard") == "big_battlefield":
                    expected_gains = 6
                    team_size = 5
                else:
                    expected_gains = 4
                    team_size = 3

                # 校验增益数量
                gains = data.get("gains") or []
                gains = [tuple(g) for g in gains if isinstance(g, list) and len(g) == 2]
                if len(gains) != expected_gains:
                    await ws_send(ws, {"type": "error", "message": f"本回合需要恰好使用 {expected_gains} 次增益"})
                    continue

                if r != room.round:
                    await ws_send(ws, {"type": "error", "message": "回合号不匹配"})
                    continue

                # 提前验证：每个位置最多2次增益
                gain_count = [0] * team_size
                for position, gain_type in gains:
                    if isinstance(position, int) and 1 <= position <= team_size:
                        gain_count[position - 1] += 1
                for i, count in enumerate(gain_count):
                    if count > 2:
                        await ws_send(ws, {"type": "error", "message": f"第{i+1}个出击位已获得{count}次增益，每个角色最多2个增益"})
                        return  # 直接返回，避免继续执行提交逻辑

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


# 忽略 favicon 请求
@app.get("/favicon.ico")
async def favicon():
    """返回空响应避免 404 错误。"""
    return HTMLResponse(content="", status_code=204)


# 自定义 404 页面
@app.exception_handler(StarletteHTTPException)
async def custom_404_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return FileResponse("static/404.html")
    return HTMLResponse(content=f"Error: {exc.detail}", status_code=exc.status_code)
