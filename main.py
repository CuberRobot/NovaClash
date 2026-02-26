from game_service import (
    build_team_from_selection,
    create_player_pools,
    run_battle_from_teams,
)


def parse_selection(input_str):
    parts = [p for p in input_str.strip().split() if p]
    indices = []
    for part in parts:
        try:
            indices.append(int(part))
        except ValueError:
            continue
    return indices


def parse_strategy_basic(s):
    s = (s or "").strip().lower()
    if s in ("2", "high", "atk", "high_atk"):
        return "high_atk"
    return "low_hp"


def parse_strategy_tags(input_str):
    if not input_str.strip():
        return []
    out = []
    for p in input_str.replace(",", " ").split():
        try:
            t = int(p)
            if 1 <= t <= 9:
                out.append(t)
        except ValueError:
            pass
    return out


def parse_gains(input_str):
    """
    输入格式示例：
    1 1,2 2,3 1  表示：
    - 第1位角色 atk+2
    - 第2位角色 hp+4
    - 第3位角色 atk+2
    """
    result = []
    if not input_str.strip():
        return result
    segments = input_str.split(",")
    for seg in segments:
        parts = seg.strip().split()
        if len(parts) != 2:
            continue
        try:
            position = int(parts[0])
            gain_type = int(parts[1])
        except ValueError:
            continue
        if position >= 1 and gain_type in (1, 2):
            result.append((position, gain_type))
    return result


def print_pool(player_index, pool):
    print(f"玩家 {player_index} 的角色池：")
    for idx, role in enumerate(pool, start=1):
        tags = role.get("tags") or []
        print(
            f"{idx}. {role['name']}  ATK={role['atk']}  "
            f"HP={role['hp']}  标签={tags}"
        )
    print()


def run_single_game():
    pool1, pool2 = create_player_pools()

    print_pool(1, pool1)
    selection1_str = input("玩家1请选择三名角色（用空格分隔序号）：")
    selection1 = parse_selection(selection1_str)
    gains1_str = input(
        "玩家1请输入 4 次增益（格式：出击位 增益类型，1=ATK+2, 2=HP+4，"
        "多个用逗号分隔）："
    )
    gains1 = parse_gains(gains1_str)
    print("玩家1攻击策略：基本策略 1=优先血量低 2=优先攻击高；附加标签（可省略，空格或逗号分隔 1–9）：")
    strategy1_basic = input("玩家1基本策略（1 或 2）：")
    strategy1_tags = input("玩家1附加优先标签（可选，如 1 4 8）：")
    try:
        team1 = build_team_from_selection(pool1, selection1, gains1)
    except ValueError as e:
        print("玩家1输入无效：%s" % e)
        return 1

    print_pool(2, pool2)
    selection2_str = input("玩家2请选择三名角色（用空格分隔序号）：")
    selection2 = parse_selection(selection2_str)
    gains2_str = input(
        "玩家2请输入 4 次增益（格式：出击位 增益类型，1=ATK+2, 2=HP+4，"
        "多个用逗号分隔）："
    )
    gains2 = parse_gains(gains2_str)
    print("玩家2攻击策略：基本策略 1=优先血量低 2=优先攻击高；附加标签（可省略）：")
    strategy2_basic = input("玩家2基本策略（1 或 2）：")
    strategy2_tags = input("玩家2附加优先标签（可选）：")
    try:
        team2 = build_team_from_selection(pool2, selection2, gains2)
    except ValueError as e:
        print("玩家2输入无效：%s" % e)
        return 0

    strategy1 = {"basic": parse_strategy_basic(strategy1_basic), "priority_tags": parse_strategy_tags(strategy1_tags)}
    strategy2 = {"basic": parse_strategy_basic(strategy2_basic), "priority_tags": parse_strategy_tags(strategy2_tags)}
    result = run_battle_from_teams(team1, team2, strategy1=strategy1, strategy2=strategy2)
    print("\n战斗过程：")
    for evt in result["events"]:
        txt = event_to_text(evt)
        if txt:
            print(txt)
    winner = int(result["winner"])
    print(f"\n本局胜者：玩家 {winner + 1}")
    return winner


def event_to_text(evt):
    """
    把 character 输出的事件标记转换成中文文本。
    网页端未来可以直接复用同样的事件结构，在前端完成转换。
    """
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
        return "%s为%s分担了%d点伤害（护盾剩余%d次）" % (
            shield_name,
            protected_name,
            transfer,
            left,
        )
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


def main():
    winner_count = [0, 0]
    for _ in range(3):
        if max(winner_count) >= 2:
            break
        winner = run_single_game()
        winner_count[winner] += 1

    if winner_count[0] > winner_count[1]:
        print("\n最终胜利：玩家 1")
    else:
        print("\n最终胜利：玩家 2")


if __name__ == "__main__":
    main()
