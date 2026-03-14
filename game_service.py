"""
对局与战斗编排：为双方生成角色池、根据选角与增益构建队伍、调用 Battlefield 执行战斗。
与输入来源无关，可供命令行与 WebSocket 共用。
"""
from random import sample, shuffle
from character import (
    Battlefield,
    Soldier,
    TAG_SELF_DESTRUCT,
    TAG_REMOVE_TAG,
    BASIC_LOW_HP,
    BASIC_HIGH_ATK,
    generate_random_pool,
    generate_chaos_pool,
    are_tags_compatible,
    ROLES,
)


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


# ========== 混沌模式函数 ==========


def create_player_pools(pool_size: int = 6, mode: str = "standard") -> tuple[list[dict], list[dict]]:
    """
    为两名玩家各生成一个独立随机角色池。

    Args:
        pool_size: 角色池大小（标准模式为 6，大战场模式为 9）
        mode: 游戏模式 ("standard"、"chaos" 或 "big_battlefield")
            - "standard" / "big_battlefield": 使用标准角色池，区别仅在于 pool_size
            - "chaos": 使用混沌模式角色池（排除自爆步兵，随机分配标签）

    Returns:
        (pool1, pool2) 两个玩家的角色池

    Note:
        混沌模式下总标签数固定为 4，每个角色最多 2 个标签
    """
    if mode == "chaos":
        # 混沌模式：需要确保双方角色不重复且标签分配合理
        # 从混沌模式可用角色池（排除自爆步兵）中生成 12 个不重复角色
        all_roles = generate_chaos_pool(pool_size * 2)
        pool1_roles = all_roles[:pool_size]
        pool2_roles = all_roles[pool_size:]

        # 为每个玩家分配标签（总共 4 个标签）
        pool1 = _assign_chaos_tags_to_pool(pool1_roles, total_tags=4)
        pool2 = _assign_chaos_tags_to_pool(pool2_roles, total_tags=4)
        return pool1, pool2
    else:
        # 标准模式：直接生成
        pool1 = generate_random_pool(pool_size)
        pool2 = generate_random_pool(pool_size)
        return _clone_role_list(pool1), _clone_role_list(pool2)


def _assign_chaos_tags_to_pool(roles: list[dict], total_tags: int = 4, max_tags_per_role: int = 2) -> list[dict]:
    """
    为角色池分配混沌模式的标签。

    Args:
        roles: 角色列表
        total_tags: 总标签数
        max_tags_per_role: 每个角色最大标签数

    Returns:
        分配好标签的角色池
    """
    pool_size = len(roles)
    # 混沌模式可用标签：排除自爆标签（TAG_SELF_DESTRUCT=1）
    tag_pool = [tag for tag in range(2, 13)]  # 2-12 共 11 种标签
    role_tags: list[list[int]] = [[] for _ in range(pool_size)]
    tags_remaining = total_tags

    # 阶段 1：尝试给每个角色至少分配 1 个标签
    roles_to_assign = list(range(pool_size))
    shuffle(roles_to_assign)

    for role_idx in roles_to_assign:
        if tags_remaining <= 0:
            break
        shuffle(tag_pool)
        for tag in tag_pool:
            test_tags = role_tags[role_idx] + [tag]
            if are_tags_compatible(test_tags) and len(test_tags) <= max_tags_per_role:
                role_tags[role_idx].append(tag)
                tags_remaining -= 1
                break

    # 阶段 2：填充剩余标签
    while tags_remaining > 0:
        assigned_any = False
        role_indices = list(range(pool_size))
        shuffle(role_indices)

        for role_idx in role_indices:
            if tags_remaining <= 0:
                break
            if len(role_tags[role_idx]) >= max_tags_per_role:
                continue

            available_tags = [t for t in tag_pool if t not in role_tags[role_idx]]
            shuffle(available_tags)

            for tag in available_tags:
                test_tags = role_tags[role_idx] + [tag]
                if are_tags_compatible(test_tags):
                    role_tags[role_idx].append(tag)
                    tags_remaining -= 1
                    assigned_any = True
                    break

        if not assigned_any:
            break

    # 构建结果
    result = []
    for i, role in enumerate(roles):
        role_copy = {
            "id": role["id"],
            "name": role["name"],
            "atk": role["atk"],
            "hp": role["hp"],
            "tags": role_tags[i],
            "type": role.get("type", "均衡"),
            "initiative": role.get("initiative", 5),
        }
        result.append(role_copy)

    return result


def build_team_from_selection(pool, indices, gains, team_size: int = 3):
    """
    根据角色池与玩家选择构建队伍并应用增益。

    Args:
        pool: 角色池列表
        indices: 池中序号（1-based），长度必须等于 team_size；越界序号被忽略，可能导致队伍不足
        gains: [(出击位, 增益类型)]，长度必须等于 team_size + 1；出击位 1–team_size，类型 1=ATK+2、2=HP+4，无效项跳过
        team_size: 队伍人数（默认 3，大战场模式为 5）

    每个角色最多只能获得 2 个增益。
    若队伍中含自爆步兵且未放首位则抛出 ValueError。
    返回 list of dict：name, atk, hp, tags, type, initiative（供 Battlefield 使用）。
    """
    expected_gains = team_size + 1  # 标准模式 4 次，大战场模式 6 次
    if len(indices) != team_size:
        raise ValueError(f"必须选择恰好 {team_size} 名角色")
    if len(gains) != expected_gains:
        raise ValueError(f"本回合需要恰好使用 {expected_gains} 次增益")

    # 检查每个角色的增益次数不超过 2
    gain_count = [0] * team_size  # 每个位置的增益次数
    for position, gain_type in gains:
        if 1 <= position <= team_size:
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


def build_big_battlefield_team(pool, indices, gains):
    """
    大战场模式：构建 5 人队伍，应用 6 次增益。

    Args:
        pool: 角色池列表（9 个角色）
        indices: 选择的 5 个角色序号（1-based）
        gains: 6 次增益 [(出击位，增益类型)]

    Returns:
        队伍列表
    """
    return build_team_from_selection(pool, indices, gains, team_size=5)


__all__ = [
    "create_player_pools",
    "build_team_from_selection",
    "build_big_battlefield_team",
    "run_battle_from_teams",
]

