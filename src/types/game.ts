// --- Spatial Topology Types ---
export type NodeType = 'city' | 'town' | 'village' | 'wilderness';
export type HouseType = 'housing' | 'shop' | 'inn' | 'facility';
export type SafetyLevel = 'safe' | 'low' | 'medium' | 'high' | 'deadly';

export interface HouseData {
  id: string;
  name: string;
  type: HouseType;
  safetyLevel: SafetyLevel;
}

export interface NodeData {
  id: string;
  name: string;
  type: NodeType;
  safetyLevel: SafetyLevel;
  connections: string[];
  houses: HouseData[];
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

// --- Intent Types ---
export type IntentType = 'idle' | 'explore' | 'combat' | 'suicidal_idle' | 'move' | 'seek_quest';

export interface IntentResult {
  intent: IntentType;
  targetId: string | null;
}

// --- Debug & Profile ---
export interface DebugState {
  lastActionRoll: number;
  lastSuccessThreshold: number;
  lastIsSuccess: boolean;
  lastTensionLevel: number;
  lastIntent?: IntentType;
  lastNarrativeInstruction?: string;
  lastImagePrompt?: string;
  lastImageError?: string;
}

export interface CharacterProfile {
  name: string;
  gender: string;
  description: string;
  personality: string;
  background: string;
  specialties: string;
  hobbies: string;
  dislikes: string;
  appearancePrompt: string;
  isFleshedOut: boolean;
  hairStyle?: string;
  hairColor?: string;
}

export interface PlayerProfile {
  name: string;
  age: string;
  gender: 'Male' | 'Female' | 'Non-binary' | 'Other';
  orientation: 'Heterosexual' | 'Homosexual' | 'Bisexual' | 'Pansexual' | 'Asexual' | 'Other';
  skinColor: string;
  height: string;
  weight: string;
  personalityDesc: string;
  hairStyle: string;
  hairColor: string;
}

export interface AICharacterSetup {
  name: string;
  age: string;
  gender: string;
  orientation: string;
  skinColor: string;
  height: string;
  weight: string;
  personalityDesc: string;
  specialties: string;
  hobbies: string;
  dislikes: string;
  hairStyle: string;
  hairColor: string;
}

// --- Core Game State ---
export interface GameState {
  // 1. Original base fields
  characterSettings: CharacterProfile;
  worldview: string;
  /** 用户原始输入的世界观描述（用于辅助生成更准确的地图） */
  worldviewUserInput: string;
  history: ChatMessage[];
  isFirstRun: boolean;
  summary: string;
  turnsSinceLastSummary: number;
  playerProfile?: PlayerProfile;
  aiCharacterSetup?: AICharacterSetup;
  loadingMessages: string[];
  language: 'zh' | 'en';

  // 2. Core survival & economy values (TS-controlled)
  hp: number;             // (0-100)
  hpDescription: string;  // AI-generated health status text
  lives: number;          // Revival tokens, 0 = permanent death
  isGameOver: boolean;
  inventory: string[];    // Explicit backpack
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

  // 4. Multi-dimensional exploration progress
  progressMap: Record<string, number>; // e.g. {"node_n1": 100, "house_h2_1": 45}

  // 5. Pacing state machine
  pacingState: {
    tensionLevel: 0 | 1 | 2 | 3 | 4;
    turnsInCurrentLevel: number;
  };

  // 6. 宏观目标追踪系统
  currentObjective: {
    targetNodeId: string;
    targetHouseId: string;
    description: string;
  } | null;

  // 7. 世界观画风提词（用于统一所有生图风格）
  artStylePrompt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
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
  inventory?: string[];
  status?: Record<string, any>;
  currentSceneVisuals?: string;
  currentNodeId?: string;
  currentHouseId?: string | null;
  debugState?: DebugState;
  bgmKey?: string;
}

export const DEFAULT_CHARACTER: CharacterProfile = {
  name: "林星",
  gender: "女",
  description: "23岁白羊座的小女生",
  personality: "",
  background: "",
  specialties: "",
  hobbies: "",
  dislikes: "",
  appearancePrompt: "",
  isFleshedOut: false
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

export const INITIAL_STATE: GameState = {
  characterSettings: DEFAULT_CHARACTER,
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

  // Progress
  progressMap: {},

  // Pacing – start at tension 0 (absolute safety)
  pacingState: {
    tensionLevel: 0,
    turnsInCurrentLevel: 0
  },

  // Objective
  currentObjective: null,

  // Art style
  artStylePrompt: ''
};
