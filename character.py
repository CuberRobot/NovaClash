"""
角色与战斗核心：角色表 ROLES、Soldier 单位、Battlefield 战场。
Battlefield 负责先手判定、轮次顺序、选目标（按策略）、伤害结算与各类标签效果（自爆/护盾/复活/中毒等），
输出事件列表与胜方索引，不依赖 IO。
"""
from random import randint, sample


# 标签编号常量，便于阅读与策略解析
TAG_SELF_DESTRUCT = 1       # 自爆
TAG_GROUP_REVIVE = 2        # 群体治疗/复活
TAG_REMOVE_TAG = 3          # 标签剥夺
TAG_SHIELD = 4              # 护盾伤害转移
TAG_HEAVY_ARMOR = 5         # 重装盔甲
TAG_PIERCING_ARROW = 6      # 箭矢穿透
TAG_BERSERK = 7             # 狂暴
TAG_POISON = 8              # 中毒
TAG_AOE = 9                 # 群体伤害
TAG_LIFE_STEAL = 10        # 吸血：造成伤害的 25% 转为回复，单次攻击回复上限 5；自爆不触发
TAG_REFLECT = 11           # 反弹：实际受到伤害的 40% 反弹给攻击者，反弹伤害不触发护盾/反弹/重装；自爆伤害不反弹
TAG_EXECUTE = 12           # 斩杀：目标当前血量 ≤ 最大血量 25% 时，本次伤害 ×1.5

# 攻击目标基本策略
BASIC_LOW_HP = "low_hp"      # 优先攻击血量低的
BASIC_HIGH_ATK = "high_atk"  # 优先攻击攻击力高的


# 角色表，直接用最简单的 dict 结构
# type: 均衡/输出/前排/辅助/特殊
# initiative: 先手值，越小越容易抢到先手
ROLES = [
    {"id": 1, "name": "均衡战士A", "atk": 8, "hp": 19, "tags": [], "type": "均衡", "initiative": 5},
    {"id": 2, "name": "均衡战士B", "atk": 6, "hp": 23, "tags": [], "type": "均衡", "initiative": 5},
    {"id": 3, "name": "均衡战士C", "atk": 5, "hp": 26, "tags": [], "type": "均衡", "initiative": 5},
    {"id": 4, "name": "自爆步兵", "atk": 16, "hp": 3, "tags": [TAG_SELF_DESTRUCT], "type": "特殊", "initiative": 2},
    {"id": 5, "name": "诅咒巫师", "atk": 6, "hp": 20, "tags": [TAG_REMOVE_TAG], "type": "特殊", "initiative": 3},
    {"id": 6, "name": "死灵法师", "atk": 4, "hp": 24, "tags": [TAG_GROUP_REVIVE], "type": "辅助", "initiative": 5},
    {"id": 7, "name": "铁甲卫士", "atk": 4, "hp": 30, "tags": [TAG_HEAVY_ARMOR], "type": "前排", "initiative": 6},
    {"id": 8, "name": "护盾部署者", "atk": 2, "hp": 33, "tags": [TAG_SHIELD], "type": "前排", "initiative": 5},
    {"id": 9, "name": "风行射手", "atk": 7, "hp": 21, "tags": [TAG_PIERCING_ARROW], "type": "输出", "initiative": 4},
    {"id": 10, "name": "狂战士", "atk": 8, "hp": 19, "tags": [TAG_BERSERK], "type": "输出", "initiative": 5},
    {"id": 11, "name": "毒药投手", "atk": 6, "hp": 21, "tags": [TAG_POISON], "type": "输出", "initiative": 5},
    {"id": 12, "name": "重炮统领", "atk": 4, "hp": 25, "tags": [TAG_AOE], "type": "输出", "initiative": 7},
    # 新增角色 13-20
    {"id": 13, "name": "均衡战士D", "atk": 7, "hp": 22, "tags": [], "type": "均衡", "initiative": 5},
    {"id": 14, "name": "均衡战士E", "atk": 5, "hp": 25, "tags": [], "type": "均衡", "initiative": 5},
    {"id": 15, "name": "暗影猎手", "atk": 6, "hp": 22, "tags": [TAG_PIERCING_ARROW], "type": "输出", "initiative": 4},
    {"id": 16, "name": "血怒斗士", "atk": 7, "hp": 18, "tags": [TAG_BERSERK], "type": "输出", "initiative": 5},
    {"id": 17, "name": "晶壁守卫", "atk": 4, "hp": 28, "tags": [TAG_HEAVY_ARMOR], "type": "前排", "initiative": 6},
    {"id": 18, "name": "噬魂者", "atk": 6, "hp": 22, "tags": [TAG_LIFE_STEAL], "type": "输出", "initiative": 5},
    {"id": 19, "name": "荆棘守卫", "atk": 4, "hp": 28, "tags": [TAG_REFLECT], "type": "前排", "initiative": 6},
    {"id": 20, "name": "处决者", "atk": 7, "hp": 20, "tags": [TAG_EXECUTE], "type": "输出", "initiative": 5},
]


class Soldier(object):
    """
    单个战斗单位：name/atk/hp/tags/team_index，以及 alive、护盾次数、中毒回合与伤害、先手值等运行时状态。
    标签决定技能（护盾分担、重装减伤、自爆、复活、中毒等），由 Battlefield 在战斗中读写状态。
    """

    def __init__(self, name, atk, hp, tags, team_index, initiative=5):
        self.name = name
        self.atk = atk
        self.max_hp = hp
        self.hp = hp
        self.tags = list(tags)  # 确保是列表，避免外部修改影响
        self.team_index = team_index
        self.initiative = initiative  # 先手值，越小越容易抢到先手

        self.alive = True

        # 护盾：仅 TAG_SHIELD 角色有 3 次；中毒：每轮次扣血，由 _apply_poison_tick 结算
        self.shield_charges = 3 if TAG_SHIELD in self.tags else 0
        self.poison_turns = 0
        self.poison_damage = 0


def has_tag(soldier, tag):
    """判断单位是否拥有某标签。"""
    return tag in soldier.tags


def generate_random_pool(pool_size=6):
    """
    从 ROLES 中无放回随机抽取 pool_size 个角色，返回 dict 列表。
    注意：返回的是原表元素的引用，修改会影响 ROLES；调用方应拷贝后再改（如 game_service._clone_role_list）。
    """
    if pool_size > len(ROLES):
        raise ValueError("角色池大小不能超过角色总数")
    return sample(ROLES, pool_size)


class Battlefield(object):
    """
    战场：持有双方 Soldier 列表与每队策略，负责先手判定、轮次内行动顺序、选目标、伤害与标签效果。
    soldiers_by_team: 二维列表 [[队0的3人], [队1的3人]]；strategies: 每队 {"basic", "priority_tags"}。
    start_battle() 返回 (events, winner_index)，events 为事件元组列表供上层转文案。
    """

    def __init__(self, soldiers_by_team, strategies=None):
        self.soldiers_by_team = soldiers_by_team
        self.team_count = len(soldiers_by_team)
        self.team_size = len(soldiers_by_team[0]) if soldiers_by_team else 0

        # 每队的攻击策略：basic 为 low_hp 或 high_atk；priority_tags 为优先攻击的标签 ID 列表
        default_strategy = {"basic": BASIC_LOW_HP, "priority_tags": []}
        self.strategies = strategies if strategies is not None else [default_strategy] * self.team_count
        while len(self.strategies) < self.team_count:
            self.strategies.append(default_strategy)

        # 死灵法师：每队复活次数与是否仍有存活死灵法师，用于 _apply_group_revive_on_lethal
        self.revive_charges = [0 for _ in range(self.team_count)]
        self.necromancer_alive = [False for _ in range(self.team_count)]

        self._init_team_state()
        self.first_team_index = self._decide_first_team()

    # ---------- 初始化：复活次数、诅咒剥夺 ----------
    def _init_team_state(self):
        for team_index, team in enumerate(self.soldiers_by_team):
            for soldier in team:
                if has_tag(soldier, TAG_GROUP_REVIVE):
                    self.revive_charges[team_index] += 1
                    self.necromancer_alive[team_index] = True

        # 诅咒巫师：移除对方一个角色的标签
        for team_index, team in enumerate(self.soldiers_by_team):
            for soldier in team:
                if has_tag(soldier, TAG_REMOVE_TAG):
                    enemy_index = self._enemy_team_index(team_index)
                    candidates = []
                    for target in self.soldiers_by_team[enemy_index]:
                        # 有标签且不是诅咒巫师本身类型、自爆兵（保持原来大致设定）
                        if target.tags and not has_tag(target, TAG_REMOVE_TAG) and not has_tag(target, TAG_SELF_DESTRUCT):
                            candidates.append(target)
                    if candidates:
                        chosen = sample(candidates, 1)[0]
                        chosen.tags = []
                        # 事件化：用标记给上层解析
                        if not hasattr(self, "_init_events"):
                            self._init_events = []
                        self._init_events.append(
                            ("CURSE_REMOVE_TAG", team_index, soldier.name, enemy_index, chosen.name)
                        )

    def _decide_first_team(self):
        """根据双方出场三人先手值之和判定先手；先手值越小越容易抢到先手，相等则随机。"""
        totals = []
        for team in self.soldiers_by_team:
            # 只计算存活单位或所有出场单位的先手值？按文档应该是出场三人的先手值之和
            total_initiative = sum(s.initiative for s in team)
            totals.append(total_initiative)
        if totals[0] < totals[1]:
            return 0
        if totals[0] > totals[1]:
            return 1
        return randint(0, 1)

    def _enemy_team_index(self, team_index):
        if self.team_count != 2:
            raise ValueError("当前只支持两个队伍")
        return 1 - team_index

    def _turn_order(self):
        """每轮次内按先手方、后手方的顺序行动。"""
        if self.first_team_index == 0:
            return [0, 1]
        return [1, 0]

    def _find_lowest_hp_target(self, team_index):
        """在敌方存活单位中找血量最低目标（兼容用，实际选目标走 _find_attack_target）。"""
        return self._find_attack_target(None, team_index, exclude=None)

    def _find_attack_target(self, attacker_team_index, enemy_team_index, exclude=None):
        """
        按策略选择攻击目标：先按附加策略（优先攻击拥有某几种标签的角色）筛一轮，
        若有多个符合则在其中按基本策略（血量最低 / 攻击最高）选一；若无符合则直接按基本策略在全体存活中选。
        """
        team = self.soldiers_by_team[enemy_team_index]
        alive = [s for s in team if s.alive and s is not exclude]
        if not alive:
            return None
        strategy = self.strategies[attacker_team_index] if attacker_team_index is not None else {"basic": BASIC_LOW_HP, "priority_tags": []}
        priority_tags = strategy.get("priority_tags") or []
        basic = strategy.get("basic") or BASIC_LOW_HP
        candidates = alive
        if priority_tags:
            with_tag = [s for s in alive if any(t in (s.tags or []) for t in priority_tags)]
            if with_tag:
                candidates = with_tag
        if basic == BASIC_HIGH_ATK:
            candidates.sort(key=lambda s: (-s.atk, s.hp))
        else:
            candidates.sort(key=lambda s: (s.hp, -s.atk))
        return candidates[0]

    # ---------- 标签效果：狂暴、重装、自爆、复活、中毒 ----------
    def _apply_berserk(self, attacker, damage):
        """狂暴：血量≤14 时伤害×1.4。"""
        if has_tag(attacker, TAG_BERSERK) and attacker.hp <= 14:
            return (damage * 14) // 10
        return damage

    def _apply_heavy_armor(self, target, damage, events):
        """重装：单次伤害≥7 时按 60% 结算并记录事件。"""
        if has_tag(target, TAG_HEAVY_ARMOR) and damage >= 7:
            new_damage = (damage * 6) // 10
            events.append(("ARMOR_REDUCE", target.team_index, target.name, damage, new_damage))
            return new_damage
        return damage

    def _apply_self_destruct_attack(self, attacker, target, damage, events):
        """
        自爆：一对一攻击，若目标最大血量≤26（脆皮判定线）则直接击杀，否则按当前伤害结算。
        攻击后自身必定死亡。若目标也是自爆步兵，则双方同归于尽（攻方自爆死，守方被击杀）。
        """
        if not has_tag(attacker, TAG_SELF_DESTRUCT):
            return damage, False

        attacker.alive = False
        events.append(("SELF_DESTRUCT", attacker.team_index, attacker.name))

        if target.max_hp <= 26:
            # 脆皮判定线 26：直接击杀；若目标也是自爆则同归于尽
            return target.hp, True
        return damage, True

    def _apply_group_revive_on_lethal(self, target, team_index, events):
        """
        死灵法师：队伍内存在存活的死灵法师，并且有剩余次数时，
        被击杀队友以 30% 最大血量（向下取整）复活。
        自爆步兵不可被复活。
        """
        if has_tag(target, TAG_SELF_DESTRUCT):
            return False
        if not self.necromancer_alive[team_index]:
            return False
        if self.revive_charges[team_index] <= 0:
            return False

        self.revive_charges[team_index] -= 1
        target.alive = True
        target.hp = target.max_hp * 4 // 10
        events.append(
            ("REVIVE", team_index, target.name, target.hp, self.revive_charges[team_index])
        )
        return True

    def _on_necromancer_death(self, team_index):
        self.necromancer_alive[team_index] = False
        self.revive_charges[team_index] = 0

    def _apply_poison_on_hit(self, attacker, target, events):
        """中毒标签攻击命中时给目标挂中毒：持续 2 轮次，每轮次伤害可叠加，上限 6。"""
        if not has_tag(attacker, TAG_POISON):
            return
        # 简单版本：叠加中毒，持续两轮次，每轮次造成 2 点伤害，最多叠 3 层
        if target.poison_turns <= 0:
            target.poison_turns = 2
            target.poison_damage = 2
        else:
            target.poison_turns = 2
            target.poison_damage = min(target.poison_damage + 2, 6)
        events.append(
            ("POISON_APPLY", attacker.team_index, attacker.name, target.team_index, target.name, target.poison_damage, target.poison_turns)
        )

    def _apply_poison_tick(self, events):
        """轮次初结算：所有存活单位若有中毒则扣血、减剩余轮次数，致死则记录 DIE(poison)。"""
        for team in self.soldiers_by_team:
            for soldier in team:
                if not soldier.alive:
                    continue
                if soldier.poison_turns > 0 and soldier.poison_damage > 0:
                    dmg = soldier.poison_damage
                    soldier.hp -= dmg
                    soldier.poison_turns -= 1
                    events.append(
                        ("POISON_TICK", soldier.team_index, soldier.name, dmg, max(soldier.hp, 0))
                    )
                    if soldier.hp <= 0:
                        soldier.hp = 0
                        soldier.alive = False
                        events.append(("DIE", soldier.team_index, soldier.name, "poison"))

    # ---------- 核心战斗循环 ----------
    def start_battle(self):
        """
        执行整场战斗：先记录先手与初始化事件，然后每轮次先中毒结算，再按出击位与先手顺序
        依次让存活单位攻击（含 AOE/单体/自爆/穿透等），直到一方全灭，返回 (events, winner_index)。
        """
        events = []
        round_count = 0  # 战斗内轮次计数（每轮次 6 人依次行动）

        # 先手权：在展示对局过程之前说明哪一方先手
        events.append(("FIRST_STRIKE", self.first_team_index))

        # 初始化阶段的事件（例如诅咒剥夺）
        if hasattr(self, "_init_events"):
            events.extend(self._init_events)

        while True:
            round_count += 1
            events.append(("ROUND", round_count))

            # 轮次开始时先结算中毒
            self._apply_poison_tick(events)

            # 本轮次内：按出击位 1→2→3，每位内按先手方→后手方行动
            for position in range(self.team_size):
                for team_index in self._turn_order():
                    attacker = self.soldiers_by_team[team_index][position]
                    if not attacker.alive:
                        events.append(("SKIP_DEAD", team_index, attacker.name))
                        continue

                    enemy_index = self._enemy_team_index(team_index)

                    # 群体伤害角色：直接对所有敌方存活单位造成伤害
                    if has_tag(attacker, TAG_AOE):
                        base_damage = attacker.atk
                        base_damage = self._apply_berserk(attacker, base_damage)
                        any_alive = False
                        for target in self.soldiers_by_team[enemy_index]:
                            if not target.alive:
                                continue
                            any_alive = True
                            events.append(
                                ("AOE_HIT", team_index, attacker.name, enemy_index, target.name, base_damage)
                            )
                            self._do_single_hit(
                                attacker,
                                target,
                                base_damage,
                                events,
                                allow_shield=True,
                                allow_poison=True,
                                allow_pierce=False,
                            )
                        if not any_alive:
                            return events, team_index
                    else:
                        target = self._find_attack_target(team_index, enemy_index)
                        if target is None:
                            return events, team_index

                        base_damage = attacker.atk
                        base_damage = self._apply_berserk(attacker, base_damage)

                        # 自爆会改变伤害和目标生死
                        base_damage, used_self_destruct = self._apply_self_destruct_attack(
                            attacker, target, base_damage, events
                        )

                        # 普通单体命中
                        self._do_single_hit(
                            attacker,
                            target,
                            base_damage,
                            events,
                            allow_shield=not used_self_destruct,
                            allow_poison=True,
                            allow_pierce=has_tag(attacker, TAG_PIERCING_ARROW),
                        )

                        # 穿透：如果第一个目标是脆皮（原始 hp<=24），再攻击另一个目标（伤害减半）
                        if has_tag(attacker, TAG_PIERCING_ARROW) and target.max_hp <= 24:
                            another = self._find_attack_target(team_index, enemy_index, exclude=target)
                            if another is not None:
                                pierce_damage = max(1, base_damage // 2)
                                events.append(
                                    ("PIERCE", team_index, attacker.name, enemy_index, another.name, pierce_damage)
                                )
                                self._do_single_hit(
                                    attacker,
                                    another,
                                    pierce_damage,
                                    events,
                                    allow_shield=not used_self_destruct,
                                    allow_poison=True,
                                    allow_pierce=False,
                                )

                    # 检查敌方是否全灭
                    still_alive = False
                    for s in self.soldiers_by_team[enemy_index]:
                        if s.alive:
                            still_alive = True
                            break
                    if not still_alive:
                        return events, team_index

    def _do_single_hit(self, attacker, target, damage, events, allow_shield, allow_poison, allow_pierce):
        """
        单次命中完整流程：若允许护盾则先由护盾单位分担 50% 并扣次数，再对主目标做重装减伤与扣血，
        致死时尝试死灵法师复活；若允许中毒则在命中后给目标挂中毒。allow_pierce 由上层处理穿透二次目标。
        """
        del allow_pierce

        # 斩杀：目标当前血量 ≤ 最大血量 25% 时，伤害 ×1.5
        if has_tag(attacker, TAG_EXECUTE) and target.hp <= target.max_hp * 25 // 100:
            damage = (damage * 3) // 2

        # 护盾转移：把 50% 伤害转到本队护盾部署者，主目标受到剩余的 50%
        original_damage = damage
        shield_target = None
        if allow_shield:
            shield_target = self._find_shield_for_team(target.team_index)
            if shield_target is not None and original_damage > 0:
                transfer = original_damage // 2  # 护盾分担 50%
                still_on_main = original_damage - transfer  # 主目标受 50%
                shield_target.shield_charges -= 1
                events.append(
                    (
                        "SHIELD_TRANSFER",
                        shield_target.team_index,
                        shield_target.name,
                        target.name,
                        transfer,
                        shield_target.shield_charges,
                    )
                )
                # 先对护盾自身结算
                self._apply_damage_to_unit(attacker, shield_target, transfer, events)
                # 主目标受到剩余的 50% 伤害
                damage = still_on_main

        # 对主目标结算伤害
        self._apply_damage_to_unit(attacker, target, damage, events)

        # 中毒
        if allow_poison and target.alive:
            self._apply_poison_on_hit(attacker, target, events)

    def _find_shield_for_team(self, team_index):
        """
        找到该队伍还存活且有剩余护盾次数的护盾部署者。
        """
        for soldier in self.soldiers_by_team[team_index]:
            if has_tag(soldier, TAG_SHIELD) and soldier.alive and soldier.shield_charges > 0:
                return soldier
        return None

    def _apply_damage_to_unit(self, attacker, target, damage, events):
        """对单个单位结算伤害：重装减伤、扣血、记录 HIT；若致死则记录 DIE、处理死灵法师死亡与复活。"""
        if damage <= 0 or not target.alive:
            return

        # 重装减伤
        damage = self._apply_heavy_armor(target, damage, events)

        # 记录实际受到的伤害用于反弹计算
        actual_damage = damage

        target.hp -= damage
        events.append(
            (
                "HIT",
                attacker.team_index,
                attacker.name,
                target.team_index,
                target.name,
                damage,
                max(target.hp, 0),
            )
        )

        # 吸血：造成伤害的 25% 转为回复，单次回复上限 5；自爆不触发
        if has_tag(attacker, TAG_LIFE_STEAL) and not has_tag(attacker, TAG_SELF_DESTRUCT):
            heal = min(damage * 25 // 100, 5)
            if heal > 0:
                attacker.hp = min(attacker.hp + heal, attacker.max_hp)
                events.append(
                    ("LIFE_STEAL", attacker.team_index, attacker.name, heal, attacker.hp)
                )

        # 反弹：实际受到伤害的 40% 反弹给攻击者，反弹伤害不触发护盾/反弹/重装；自爆不反弹
        if has_tag(target, TAG_REFLECT) and not has_tag(attacker, TAG_SELF_DESTRUCT):
            reflect_damage = actual_damage * 4 // 10
            if reflect_damage > 0:
                attacker.hp -= reflect_damage
                events.append(
                    ("REFLECT", target.team_index, target.name, attacker.team_index, attacker.name, reflect_damage, max(attacker.hp, 0))
                )
                if attacker.hp <= 0:
                    attacker.hp = 0
                    attacker.alive = False
                    events.append(("DIE", attacker.team_index, attacker.name, "reflect"))
                    # 反弹杀死攻击者后，检查攻击者是否为死灵法师
                    if has_tag(attacker, TAG_GROUP_REVIVE):
                        self._on_necromancer_death(attacker.team_index)
                    # 尝试死灵法师复活
                    revived = self._apply_group_revive_on_lethal(
                        attacker, attacker.team_index, events
                    )
                    if revived:
                        pass  # 复活后反弹伤害结算结束

        if target.hp <= 0:
            target.hp = 0
            target.alive = False
            events.append(("DIE", target.team_index, target.name, "damage"))

            # 如果这个目标是死灵法师，则队伍不再有复活能力
            if has_tag(target, TAG_GROUP_REVIVE):
                self._on_necromancer_death(target.team_index)

            # 尝试死灵法师复活（目标必须不是死灵法师本人）
            revived = self._apply_group_revive_on_lethal(
                target, target.team_index, events
            )
            if revived:
                # 复活后视为此次伤害结算结束
                return


__all__ = [
    "TAG_SELF_DESTRUCT",
    "TAG_GROUP_REVIVE",
    "TAG_REMOVE_TAG",
    "TAG_SHIELD",
    "TAG_HEAVY_ARMOR",
    "TAG_PIERCING_ARROW",
    "TAG_BERSERK",
    "TAG_POISON",
    "TAG_AOE",
    "TAG_LIFE_STEAL",
    "TAG_REFLECT",
    "TAG_EXECUTE",
    "ROLES",
    "Soldier",
    "Battlefield",
    "generate_random_pool",
]
