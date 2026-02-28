"""
对局与战斗编排：为双方生成角色池、根据选角与增益构建队伍、调用 Battlefield 执行战斗。
与输入来源无关，可供命令行与 WebSocket 共用。
"""
from character import (
    Battlefield,
    Soldier,
    TAG_SELF_DESTRUCT,
    BASIC_LOW_HP,
    BASIC_HIGH_ATK,
    generate_random_pool,
)


def create_player_pools(pool_size=6):
    """
    为两名玩家各生成一个独立随机角色池（从全角色表无放回抽样），返回 (pool1, pool2)。
    每个池子为角色 dict 列表，含 id/name/atk/hp/tags；返回前做浅拷贝，避免修改影响原表。
    """
    pool1 = generate_random_pool(pool_size)
    pool2 = generate_random_pool(pool_size)
    return _clone_role_list(pool1), _clone_role_list(pool2)


def _clone_role_list(role_list):
    """对角色列表做浅拷贝，复制 id/name/atk/hp/tags/type/initiative，tags 转为新列表，避免篡改原始 ROLES。"""
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "atk": r["atk"],
            "hp": r["hp"],
            "tags": list(r["tags"]),
            "type": r.get("type", "均衡"),
            "initiative": r.get("initiative", 5),
        }
        for r in role_list
    ]


def build_team_from_selection(pool, indices, gains):
    """
    根据角色池与玩家选择构建 3 人队伍并应用增益。
    indices: 池中序号（1-based），长度必须为 3；越界序号被忽略，可能导致队伍不足 3 人。
    gains: [(出击位, 增益类型)] 长度必须为 4；出击位 1–3，类型 1=ATK+2、2=HP+4，无效项跳过。
    每个角色最多只能获得 2 个增益。
    若队伍中含自爆步兵且未放首位则抛出 ValueError。
    返回 list of dict：name, atk, hp, tags, type, initiative（供 Battlefield 使用）。
    """
    if len(indices) != 3:
        raise ValueError("必须选择恰好 3 名角色")
    if len(gains) != 4:
        raise ValueError("本回合需要恰好使用 4 次增益")

    # 检查每个角色的增益次数不超过 2
    gain_count = [0, 0, 0]  # 每个位置的增益次数
    for position, gain_type in gains:
        if 1 <= position <= 3:
            gain_count[position - 1] += 1
    for i, count in enumerate(gain_count):
        if count > 2:
            raise ValueError(f"第 {i+1} 个出击位已获得 {count} 次增益，每个角色最多 2 个增益")

    team = []
    for idx in indices:
        pos = idx - 1
        if 0 <= pos < len(pool):
            role = pool[pos]
            team.append(
                {
                    "name": role["name"],
                    "atk": int(role["atk"]),
                    "hp": int(role["hp"]),
                    "tags": list(role["tags"]),
                    "type": role.get("type", "均衡"),
                    "initiative": role.get("initiative", 5),
                }
            )

    for position, gain_type in gains:
        i = position - 1
        if not (0 <= i < len(team)):
            continue
        if gain_type == 1:
            team[i]["atk"] += 2
        elif gain_type == 2:
            team[i]["hp"] += 4

    # 规则：自爆步兵只能放在首位（队伍第1个出击位）
    if team:
        first_has_self_destruct = TAG_SELF_DESTRUCT in team[0]["tags"]
        any_has_self_destruct = False
        for u in team:
            if TAG_SELF_DESTRUCT in u["tags"]:
                any_has_self_destruct = True
                break
        if any_has_self_destruct and not first_has_self_destruct:
            raise ValueError("自爆步兵只能放在队伍首位（第1个出击位）")

    return team


def _convert_team_dicts_to_soldiers(team_dicts, team_index):
    """将队伍 dict 列表转为 Soldier 实例列表，team_index 为队伍编号（0 或 1）。"""
    soldiers = []
    for data in team_dicts:
        soldiers.append(
            Soldier(
                name=data["name"],
                atk=int(data["atk"]),
                hp=int(data["hp"]),
                tags=list(data["tags"]),
                team_index=team_index,
                initiative=int(data.get("initiative", 5)),
            )
        )
    return soldiers


def _normalize_strategy(s):
    """
    规范化策略：s 为 None 或 dict。basic 只接受 low_hp / high_atk，否则默认 low_hp；
    priority_tags 支持 key 为 priority_tags 或 priority_tags_list，值为数字或可转数字的字符串，范围外的忽略。
    返回 {basic, priority_tags} 供 Battlefield 使用。
    """
    if not s:
        return {"basic": BASIC_LOW_HP, "priority_tags": []}
    basic = s.get("basic") or BASIC_LOW_HP
    if basic not in (BASIC_LOW_HP, BASIC_HIGH_ATK):
        basic = BASIC_LOW_HP
    tags = s.get("priority_tags") or s.get("priority_tags_list") or []
    priority_tags = [int(t) for t in tags if isinstance(t, (int, float)) or (isinstance(t, str) and t.isdigit())]
    return {"basic": basic, "priority_tags": priority_tags}


def run_battle_from_teams(team1, team2, strategy1=None, strategy2=None):
    """
    用两支队伍与可选策略运行整场战斗。team1/team2 为 build_team_from_selection 返回的 dict 列表；
    strategy1/strategy2 经 _normalize_strategy 后传入 Battlefield。
    返回 {"events": [...], "winner": 0|1}，winner 为胜方队伍索引。
    """
    soldiers_by_team = [
        _convert_team_dicts_to_soldiers(team1, 0),
        _convert_team_dicts_to_soldiers(team2, 1),
    ]
    strategies = [_normalize_strategy(strategy1), _normalize_strategy(strategy2)]
    battlefield = Battlefield(soldiers_by_team, strategies=strategies)
    events, winner_index = battlefield.start_battle()
    return {"events": events, "winner": winner_index}


__all__ = ["create_player_pools", "build_team_from_selection", "run_battle_from_teams"]

