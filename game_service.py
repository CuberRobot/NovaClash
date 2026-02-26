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
    返回两个玩家的角色池，每个都是角色 dict 的列表。
    """
    pool1 = generate_random_pool(pool_size)
    pool2 = generate_random_pool(pool_size)
    return _clone_role_list(pool1), _clone_role_list(pool2)


def _clone_role_list(role_list):
    # 简单浅拷贝，避免直接修改原始角色表
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "atk": r["atk"],
            "hp": r["hp"],
            "tags": list(r["tags"]),
        }
        for r in role_list
    ]


def build_team_from_selection(pool, indices, gains):
    """
    根据角色池和玩家选择构建一支队伍。
    indices: 角色在池子中的序号（1 基），必须正好 3 个。
    gains: 列表 [(出击位, 增益类型)]，1=ATK+2，2=HP+4，必须正好 4 个。
    """
    if len(indices) != 3:
        raise ValueError("必须选择恰好 3 名角色")
    if len(gains) != 4:
        raise ValueError("本回合需要恰好使用 4 次增益")
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
    soldiers = []
    for data in team_dicts:
        soldiers.append(
            Soldier(
                name=data["name"],
                atk=int(data["atk"]),
                hp=int(data["hp"]),
                tags=list(data["tags"]),
                team_index=team_index,
            )
        )
    return soldiers


def _normalize_strategy(s):
    """s 为 None 或 dict，返回 {basic, priority_tags}。"""
    if not s:
        return {"basic": BASIC_LOW_HP, "priority_tags": []}
    basic = s.get("basic") or BASIC_LOW_HP
    if basic not in (BASIC_LOW_HP, BASIC_HIGH_ATK):
        basic = BASIC_LOW_HP
    tags = s.get("priority_tags") or s.get("priority_tags_list") or []
    priority_tags = [int(t) for t in tags if isinstance(t, (int, float)) or (isinstance(t, str) and t.isdigit())]
    return {"basic": basic, "priority_tags": priority_tags}


def run_battle_from_teams(team1, team2, strategy1=None, strategy2=None):
    soldiers_by_team = [
        _convert_team_dicts_to_soldiers(team1, 0),
        _convert_team_dicts_to_soldiers(team2, 1),
    ]
    strategies = [_normalize_strategy(strategy1), _normalize_strategy(strategy2)]
    battlefield = Battlefield(soldiers_by_team, strategies=strategies)
    events, winner_index = battlefield.start_battle()
    return {"events": events, "winner": winner_index}


__all__ = ["create_player_pools", "build_team_from_selection", "run_battle_from_teams"]

