export const TAG_LABELS = {
  1: '自爆',
  2: '复活',
  3: '剥夺',
  4: '护盾',
  5: '重装',
  6: '穿透',
  7: '狂暴',
  8: '中毒',
  9: '群伤',
};

export const TAG_IDS = {
  SELF_DESTRUCT: 1,
  GROUP_REVIVE: 2,
  REMOVE_TAG: 3,
  SHIELD: 4,
  HEAVY_ARMOR: 5,
  PIERCING_ARROW: 6,
  BERSERK: 7,
  POISON: 8,
  AOE: 9,
};

export const ROLE_COLORS = {
  1:  { name: '均衡战士A', primary: '#7eb8d8', accent: '#b0d4e8' },
  2:  { name: '均衡战士B', primary: '#7ed8a0', accent: '#b0e8c8' },
  3:  { name: '均衡战士C', primary: '#a07ed8', accent: '#c8b0e8' },
  4:  { name: '自爆步兵',  primary: '#e85830', accent: '#ff9040' },
  5:  { name: '诅咒巫师',  primary: '#6a2c91', accent: '#9040c0' },
  6:  { name: '死灵法师',  primary: '#5a1a7a', accent: '#40d890' },
  7:  { name: '铁甲卫士',  primary: '#4a5ab0', accent: '#7080d8' },
  8:  { name: '护盾部署者', primary: '#2898b8', accent: '#40c8e0' },
  9:  { name: '风行射手',  primary: '#20b8c8', accent: '#60e8f0' },
  10: { name: '狂战士',    primary: '#a02020', accent: '#e84040' },
  11: { name: '毒药投手',  primary: '#208840', accent: '#40c060' },
  12: { name: '重炮统领',  primary: '#b89020', accent: '#e8c040' },
};

export const RANGED_TAGS = [TAG_IDS.PIERCING_ARROW, TAG_IDS.POISON, TAG_IDS.AOE];

export const STORAGE_NAME = 'xingyun_player_name';
export const STORAGE_HISTORY = 'xingyun_history';
export const STORAGE_SETTINGS = 'xingyun_settings';
export const HISTORY_MAX = 8;

export const GAME_MODES = {
  MODE_3D: '3d',
  MODE_CARD: 'card',
  MODE_BUTTON: 'button',
};

export const VIEWS = {
  LOBBY: 'lobby',
  GAME: 'game',
  LORE: 'lore',
  SETTINGS: 'settings',
};
