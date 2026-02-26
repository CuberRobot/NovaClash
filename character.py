from random import randint, sample


# 标签编号常量，便于阅读
TAG_SELF_DESTRUCT = 1       # 自爆
TAG_GROUP_REVIVE = 2        # 群体治疗/复活
TAG_REMOVE_TAG = 3          # 标签剥夺
TAG_SHIELD = 4              # 护盾伤害转移
TAG_HEAVY_ARMOR = 5         # 重装盔甲
TAG_PIERCING_ARROW = 6      # 箭矢穿透
TAG_BERSERK = 7             # 狂暴
TAG_POISON = 8              # 中毒
TAG_AOE = 9                 # 群体伤害

# 攻击目标基本策略
BASIC_LOW_HP = "low_hp"      # 优先攻击血量低的
BASIC_HIGH_ATK = "high_atk"  # 优先攻击攻击力高的


# 角色表，直接用最简单的 dict 结构
ROLES = [
    {"id": 1, "name": "均衡战士A", "atk": 8, "hp": 19, "tags": []},
    {"id": 2, "name": "均衡战士B", "atk": 6, "hp": 23, "tags": []},
    {"id": 3, "name": "均衡战士C", "atk": 4, "hp": 26, "tags": []},
    {"id": 4, "name": "自爆步兵", "atk": 16, "hp": 1, "tags": [TAG_SELF_DESTRUCT]},
    {"id": 5, "name": "诅咒巫师", "atk": 6, "hp": 20, "tags": [TAG_REMOVE_TAG]},
    {"id": 6, "name": "死灵法师", "atk": 4, "hp": 24, "tags": [TAG_GROUP_REVIVE]},
    {"id": 7, "name": "铁甲卫士", "atk": 4, "hp": 30, "tags": [TAG_HEAVY_ARMOR]},
    {"id": 8, "name": "护盾部署者", "atk": 2, "hp": 33, "tags": [TAG_SHIELD]},
    {"id": 9, "name": "风行射手", "atk": 7, "hp": 21, "tags": [TAG_PIERCING_ARROW]},
    {"id": 10, "name": "狂战士", "atk": 8, "hp": 19, "tags": [TAG_BERSERK]},
    {"id": 11, "name": "毒药投手", "atk": 6, "hp": 21, "tags": [TAG_POISON]},
    {"id": 12, "name": "重炮统领", "atk": 5, "hp": 25, "tags": [TAG_AOE]},
]


class Soldier(object):
    """
    最简单的战士对象，直接用属性，不用额外库。
    """

    def __init__(self, name, atk, hp, tags, team_index):
        self.name = name
        self.atk = atk
        self.max_hp = hp
        self.hp = hp
        self.tags = list(tags)  # 确保是列表
        self.team_index = team_index

        self.alive = True

        # 辅助状态，用于某些标签
        self.shield_charges = 3 if TAG_SHIELD in self.tags else 0
        self.poison_turns = 0
        self.poison_damage = 0


def has_tag(soldier, tag):
    return tag in soldier.tags


def generate_random_pool(pool_size=6):
    """
    从全角色表中随机抽取一份角色池。
    返回的是角色 dict 的列表（不拷贝，使用时注意不要直接修改原表）。
    """
    if pool_size > len(ROLES):
        raise ValueError("角色池大小不能超过角色总数")
    return sample(ROLES, pool_size)


class Battlefield(object):
    """
    只负责战斗，不关心输入来源。
    soldiers_by_team: [[Soldier, Soldier, Soldier], [...]]
    """

    def __init__(self, soldiers_by_team, strategies=None):
        self.soldiers_by_team = soldiers_by_team
        self.team_count = len(soldiers_by_team)
        self.team_size = len(soldiers_by_team[0]) if soldiers_by_team else 0

        # 每队的攻击策略：{"basic": "low_hp"|"high_atk", "priority_tags": [tag_id,...]}
        default_strategy = {"basic": BASIC_LOW_HP, "priority_tags": []}
        self.strategies = strategies if strategies is not None else [default_strategy] * self.team_count
        while len(self.strategies) < self.team_count:
            self.strategies.append(default_strategy)

        # 死灵法师复活次数，且要求死灵法师存活时才生效
        self.revive_charges = [0 for _ in range(self.team_count)]
        self.necromancer_alive = [False for _ in range(self.team_count)]

        self._init_team_state()
        self.first_team_index = self._decide_first_team()

    # ---------- 初始化 ----------
    def _init_team_state(self):
        for team_index, team in enumerate(self.soldiers_by_team):
            for soldier in team:
                if has_tag(soldier, TAG_GROUP_REVIVE):
                    self.revive_charges[team_index] += 2
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
        """增益后双方攻击力与血量之和，小的一方先手。"""
        totals = []
        for team in self.soldiers_by_team:
            total_atk = sum(s.atk for s in team)
            total_hp = sum(s.max_hp for s in team)
            totals.append(total_atk + total_hp)
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
        if self.first_team_index == 0:
            return [0, 1]
        return [1, 0]

    def _find_lowest_hp_target(self, team_index):
        """保留用于穿透等需要「另一目标」时的兼容。"""
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

    # ---------- 标签相关辅助 ----------
    def _apply_berserk(self, attacker, damage):
        if has_tag(attacker, TAG_BERSERK) and attacker.hp <= 14:
            return (damage * 14) // 10
        return damage

    def _apply_heavy_armor(self, target, damage, events):
        if has_tag(target, TAG_HEAVY_ARMOR) and damage >= 8:
            new_damage = (damage * 6) // 10
            events.append(("ARMOR_REDUCE", target.team_index, target.name, damage, new_damage))
            return new_damage
        return damage

    def _apply_self_destruct_attack(self, attacker, target, damage, events):
        """
        自爆：一对一攻击，如果目标原始 hp <=24 直接击杀，否则造成固定伤害。
        无论如何攻击后自身死亡。
        """
        if not has_tag(attacker, TAG_SELF_DESTRUCT):
            return damage, False

        attacker.alive = False
        events.append(("SELF_DESTRUCT", attacker.team_index, attacker.name))

        if target.max_hp <= 24:
            # 直接击杀：把伤害设为当前 hp
            return target.hp, True
        # 否则按照当前 damage 处理
        return damage, True

    def _apply_group_revive_on_lethal(self, target, team_index, events):
        """
        死灵法师：队伍内存在存活的死灵法师，并且有剩余次数时，
        被击杀队友以一半血量复活。
        """
        if not self.necromancer_alive[team_index]:
            return False
        if self.revive_charges[team_index] <= 0:
            return False

        self.revive_charges[team_index] -= 1
        target.alive = True
        target.hp = target.max_hp // 2
        events.append(
            ("REVIVE", team_index, target.name, target.hp, self.revive_charges[team_index])
        )
        return True

    def _on_necromancer_death(self, team_index):
        self.necromancer_alive[team_index] = False
        self.revive_charges[team_index] = 0

    def _apply_poison_on_hit(self, attacker, target, events):
        if not has_tag(attacker, TAG_POISON):
            return
        # 简单版本：叠加中毒，持续两回合，每回合造成 2 点伤害，最多叠 3 层
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

    # ---------- 核心战斗 ----------
    def start_battle(self):
        events = []
        round_count = 0

        # 先手权：在展示对局过程之前说明哪一方先手
        events.append(("FIRST_STRIKE", self.first_team_index))

        # 初始化阶段的事件（例如诅咒剥夺）
        if hasattr(self, "_init_events"):
            events.extend(self._init_events)

        while True:
            round_count += 1
            events.append(("ROUND", round_count))

            # 回合开始时先结算中毒
            self._apply_poison_tick(events)

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
        单次命中流程：护盾 -> 防御减伤 -> 伤害结算 -> 复活 / 死亡 -> 中毒
        allow_pierce 目前只是占位，避免逻辑太乱（已经在上层处理）。
        """
        del allow_pierce

        # 护盾转移：把 50% 伤害转到本队护盾部署者
        original_damage = damage
        shield_target = None
        if allow_shield:
            shield_target = self._find_shield_for_team(target.team_index)
            if shield_target is not None and original_damage > 0:
                transfer = original_damage // 2
                still_on_main = original_damage - transfer
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
        if damage <= 0 or not target.alive:
            return

        # 重装减伤
        damage = self._apply_heavy_armor(target, damage, events)

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
    "ROLES",
    "Soldier",
    "Battlefield",
    "generate_random_pool",
]
