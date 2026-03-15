// --- Spatial Topology Types ---
export type NodeType = 'city' | 'town' | 'village' | 'wilderness';
export type HouseType = 'housing' | 'shop' | 'inn' | 'facility';
export type SafetyLevel = 'safe' | 'low' | 'medium' | 'high' | 'deadly';

/** 持久 BOSS 标记（探索度满触发，击败后清除） */
export interface ActiveBoss {
  tensionLevel: 2 | 3 | 4;
}

export interface HouseData {
  id: string;
  name: string;
  type: HouseType;
  safetyLevel: SafetyLevel;
  progress: number;   // 0-100 室内搜刮进度
  revealed: boolean;  // 是否已揭盲（持久化，不重复通知）
  activeBoss?: ActiveBoss | null; // 持久 BOSS 战（探索度满触发）
}

export interface NodeData {
  id: string;
  name: string;
  type: NodeType;
  safetyLevel: SafetyLevel;
  connections: string[];
  houses: HouseData[];
  progress: number;   // 0-100 区域探索进度
  activeBoss?: ActiveBoss | null; // 持久 BOSS 战（探索度满触发）
}

/**
 * 根据 safetyLevel 映射 BOSS 紧张度
 * safe → null (不触发), low/medium → T2, high → T3, deadly → T4
 */
export function bossTensionFromSafety(safety: SafetyLevel): 2 | 3 | 4 | null {
  switch (safety) {
    case 'safe': return null;
    case 'low': return null;
    case 'medium': return 2;
    case 'high': return 3;
    case 'deadly': return 4;
  }
}

export interface WorldData {
  id: string;
  name: string;
  nodes: NodeData[];
}

/** 归一化节点连接为双向：如果 A 连接 B，则 B 也必须连接 A */
export function normalizeConnections(worldData: WorldData): WorldData {
  const nodeMap = new Map(worldData.nodes.map(n => [n.id, new Set(n.connections)]));
  for (const node of worldData.nodes) {
    for (const targetId of node.connections) {
      const targetSet = nodeMap.get(targetId);
      if (targetSet && !targetSet.has(node.id)) {
        targetSet.add(node.id);
      }
    }
  }
  return {
    ...worldData,
    nodes: worldData.nodes.map(n => ({
      ...n,
      connections: Array.from(nodeMap.get(n.id) || n.connections),
    })),
  };
}

// --- Inventory & Item Types ---
export type ItemType = 'quest' | 'escape' | 'weapon' | 'armor';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface InventoryItem {
  id: string;
  name: string;
  type: ItemType;
  description: string;
  rarity: Rarity;
  icon: string;
  quantity: number;
  buff: number | null; // weapon/armor only: 20-80%
}

/** 稀有度颜色映射 */
export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',    // 灰
  uncommon: '#22c55e',  // 绿
  rare: '#3b82f6',      // 蓝
  epic: '#a855f7',      // 紫
  legendary: '#f97316', // 橙
};

/** 背包容量上限 */
export const INVENTORY_CAPACITY = 10;

/** 退敌道具稀有度概率表: common 50%, uncommon 30%, rare 15%, epic 4%, legendary 1% */
export function rollEscapeRarity(): Rarity {
  const r = Math.random();
  if (r < 0.01) return 'legendary';
  if (r < 0.05) return 'epic';
  if (r < 0.20) return 'rare';
  if (r < 0.50) return 'uncommon';
  return 'common';
}

/** 退敌道具图标池（按稀有度） */
export const ESCAPE_ICON_POOL: Record<Rarity, string[]> = {
  common:    ['💨', '🪢', '💚'],
  uncommon:  ['✨', '😢', '🎯'],
  rare:      ['🧪', '🛡️', '🔮'],
  epic:      ['📜', '⚡', '🔥'],
  legendary: ['🌟', '💎', '☄️'],
};

export function pickEscapeIcon(rarity: Rarity): string {
  const pool = ESCAPE_ICON_POOL[rarity];
  return pool[Math.floor(Math.random() * pool.length)];
}

// --- Quest Chain Types ---
export interface QuestStage {
  stageIndex: number;
  targetNodeId: string;
  targetHouseId: string; // '' means node-level (outdoors)
  targetLocationName: string;
  description: string;
  requiredItems: { name: string; id: string }[];
  completed: boolean;
  arrivedAtTarget: boolean;
}

// --- Equipment Presets ---
/**
 * 装备 buff 分布表（每稀有度 5 件）
 * 可在此处统一调整数值
 */
export const EQUIPMENT_BUFF_TABLE: Record<Rarity, number[]> = {
  common:    [20, 22, 24, 26, 28],
  uncommon:  [32, 34, 36, 38, 40],
  rare:      [44, 48, 52, 56, 60],
  epic:      [62, 66, 70, 74, 78],
  legendary: [72, 74, 76, 78, 80],
};

// --- Intent Types ---
export type IntentType = 'idle' | 'explore' | 'combat' | 'suicidal_idle' | 'move' | 'seek_quest' | 'use_item';

export interface IntentResult {
  intent: IntentType;
  targetId: string | null;
  direction?: 'forward' | 'back';
  itemName?: string; // use_item 意图时，玩家试图使用的道具名
}

// --- Debug & Profile ---
export interface DebugState {
  lastActionRoll: number;
  lastSuccessThreshold: number;
  lastIsSuccess: boolean;
  lastTensionLevel: number;
  lastIntent?: IntentType;
  lastNarrativeInstruction?: string;
  lastFormula?: string;
  lastImagePrompt?: string;
  lastImageError?: string;
}

/**
 * Debug 面板的「下一回合覆写」指令
 * 存储在 GameState 上，useChatLogic 在管线结束后一次性消费并清除
 * 所有字段均为 optional —— 只有设置了的字段才会覆写管线结果
 */
export interface DebugOverrides {
  /** 强制下一回合紧张度 */
  tensionLevel?: 0 | 1 | 2 | 3 | 4;
  /** 强制下一回合 HP */
  hp?: number;
  /** 强制下一回合命数 */
  lives?: number;
  /** 强制传送到指定 nodeId（清除 transitState） */
  teleportNodeId?: string;
  /** 强制传送到指定 houseId（需搭配 teleportNodeId） */
  teleportHouseId?: string | null;
  /** 强制覆写某个 progressKey 的值 */
  progressOverride?: { key: string; value: number };
  /** 强制派发任务 */
  forceQuest?: { targetNodeId: string; targetHouseId: string; targetLocationName: string; description: string };
  /** 清除当前任务 */
  clearQuest?: boolean;
  /** 强制好感度 */
  affection?: number;
  /** 强制 D20 掷骰值 (1-20) */
  forcedRoll?: number;
  /** 强制 Game Over */
  forceGameOver?: boolean;
}

export type Gender = 'Male' | 'Female' | 'Non-binary' | 'Other';
export type Orientation = 'Heterosexual' | 'Homosexual' | 'Bisexual' | 'Pansexual' | 'Asexual' | 'Other';

export interface CharacterProfile {
  // 身份
  name: string;
  age: string;
  gender: Gender | '';
  orientation: Orientation | '';
  // 外貌
  skinColor: string;
  height: string;
  weight: string;
  hairStyle: string;
  hairColor: string;
  // 内在
  personalityDesc: string;
  specialties: string;
  hobbies: string;
  dislikes: string;
  // AI 丰富
  description: string;
  personality: string;
  background: string;
  appearancePrompt: string;
  isFleshedOut: boolean;
}

// --- Core Game State ---
export interface GameState {
  // 1. Original base fields
  playerProfile: CharacterProfile;
  companionProfile: CharacterProfile;
  worldview: string;
  /** 用户原始输入的世界观描述（用于辅助生成更准确的地图） */
  worldviewUserInput: string;
  history: ChatMessage[];
  isFirstRun: boolean;
  summary: string;
  turnsSinceLastSummary: number;
  loadingMessages: string[];
  language: 'zh' | 'en';

  // 2. Core survival & economy values (TS-controlled)
  hp: number;             // (0-100)
  hpDescription: string;  // AI-generated health status text
  lives: number;          // Revival tokens, 0 = permanent death
  isGameOver: boolean;
  inventory: InventoryItem[];    // 背包（上限 INVENTORY_CAPACITY 格）
  status: Record<string, any>; // Soft statuses only (e.g. wet, bleeding)

  // 3. Global map & spatial pointers
  worldData: WorldData | null;
  mapImageFileName: string | null;
  currentWorldId: string | null;
  currentNodeId: string | null;
  characterPortraitFileName: string | null;
  currentHouseId: string | null; // null = outdoors in Node

  // 新增：旅途状态。null 表示在具体地点内；非 null 表示正在赶路。
  transitState: {
    fromNodeId: string;
    toNodeId: string;
    pathProgress: number; // 0-100%
    lockedTheme: string | null; // 当前旅途锁定的遭遇主题
  } | null;

  // 动态记忆黑名单：已经历过的遭遇主题，不再重复
  exhaustedThemes: string[];

  // 4. Pacing state machine
  pacingState: {
    tensionLevel: 0 | 1 | 2 | 3 | 4;
    turnsInCurrentLevel: number;
  };

  // 6. 宏观目标追踪系统
  currentObjective: {
    targetNodeId: string;
    targetHouseId: string;
    targetLocationName: string;
    description: string;
  } | null;

  // 6.5 任务链系统
  questChain: QuestStage[] | null;
  currentQuestStageIndex: number;

  // 6.6 装备预设池（世界观生成时创建，获取后从池中移除）
  equipmentPresets: InventoryItem[];

  // 7. 世界观画风提词（用于统一所有生图风格）
  artStylePrompt: string;

  // 8. 好感度系统
  affection: number; // 0-100，初始值由 AI 根据世界观和性格生成

  // 9. Debug 覆写（下一回合生效后自动清除）
  debugOverrides?: DebugOverrides;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model' | 'narrator';
  text: string;
  imageFileName?: string;
  timestamp: number;
  // Snapshot of game state AFTER this message was processed
  pacingState?: {
    tensionLevel: 0 | 1 | 2 | 3 | 4;
    turnsInCurrentLevel: number;
  };
  hp?: number;
  hpDescription?: string;
  inventory?: InventoryItem[];
  status?: Record<string, any>;
  currentSceneVisuals?: string;
  currentNodeId?: string;
  currentHouseId?: string | null;
  debugState?: DebugState;
  bgmKey?: string;
  affection?: number;
}

export const DEFAULT_PROFILE: CharacterProfile = {
  name: '', age: '', gender: '', orientation: '',
  skinColor: '', height: '', weight: '',
  hairStyle: '', hairColor: '',
  personalityDesc: '', specialties: '', hobbies: '', dislikes: '',
  description: '', personality: '', background: '',
  appearancePrompt: '', isFleshedOut: false,
};
export const SUMMARY_THRESHOLD = 20;
export const KEEP_RECENT_TURNS = 10;
export const ENABLE_DEBUG_UI = true;

export const BGM_LIST = {
  0: ["levelBGM/Level0_1.mp3", "levelBGM/Level0_2.mp3"],
  1: ["levelBGM/Level1_1.mp3", "levelBGM/Level1_2.mp3", "levelBGM/Level1_3.mp3", "levelBGM/Level1_4.mp3"],
  2: ["levelBGM/Level2_1.mp3", "levelBGM/Level2_2.mp3"],
  3: ["levelBGM/Level3_1.mp3", "levelBGM/Level3_2.mp3"],
  4: ["levelBGM/Level4_1.mp3", "levelBGM/Level4_2.mp3"]
};

export const DEFAULT_LOADING_MESSAGES = [
  "正在连接神经网络...",
  "正在翻阅世界辞典...",
  "正在校准量子波动...",
  "正在给仓鼠喂食...",
  "正在计算蝴蝶效应...",
  "正在加载多重宇宙...",
  "正在寻找薛定谔的猫...",
  "正在编译命运...",
  "正在重构现实...",
  "正在与外星文明握手...",
  "正在清理缓存中的幽灵...",
  "正在给NPC分配台词...",
  "正在渲染空气...",
  "正在调试重力参数...",
  "正在给太阳充能...",
  "正在种植森林...",
  "正在编织时间线...",
  "正在唤醒沉睡的巨龙...",
  "正在给史莱姆上色...",
  "正在打磨宝剑...",
  "正在给魔法书除尘...",
  "正在寻找丢失的像素...",
  "正在给云朵充气...",
  "正在给星星抛光...",
  "正在给月亮换灯泡...",
  "正在给黑洞加盖子...",
  "正在给银河系吸尘...",
  "正在给时间上发条...",
  "正在给命运洗牌...",
  "正在给希望浇水..."
];

export const INIT_PLAYER_PROFILE: Partial<CharacterProfile> = {
  gender: 'Male',
  orientation: 'Heterosexual'
};

export const INIT_COMPANION_PROFILE: Partial<CharacterProfile> = {
  gender: 'Female',
  orientation: 'Heterosexual'
};

export const INITIAL_STATE: GameState = {
  playerProfile: { ...DEFAULT_PROFILE, ...INIT_PLAYER_PROFILE },
  companionProfile: { ...DEFAULT_PROFILE, ...INIT_COMPANION_PROFILE },
  worldview: "",
  worldviewUserInput: "",
  history: [],
  isFirstRun: true,
  summary: "",
  turnsSinceLastSummary: 0,
  loadingMessages: DEFAULT_LOADING_MESSAGES,
  language: 'zh',

  // Core survival
  hp: 100,
  hpDescription: '',
  lives: 3,
  isGameOver: false,
  inventory: [],
  status: {},

  // Spatial pointers
  worldData: null,
  mapImageFileName: null,
  currentWorldId: null,
  currentNodeId: null,
  characterPortraitFileName: null,
  currentHouseId: null,
  transitState: null,
  exhaustedThemes: [],

  // Pacing – start at tension 0 (absolute safety)
  pacingState: {
    tensionLevel: 0,
    turnsInCurrentLevel: 0
  },

  // Objective
  currentObjective: null,

  // Quest chain
  questChain: null,
  currentQuestStageIndex: 0,

  // Equipment presets
  equipmentPresets: [],

  // Art style
  artStylePrompt: '',

  // Affection
  affection: 50,

  // Debug
  debugOverrides: undefined
};
