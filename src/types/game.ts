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
  hobbies: string;
  isFleshedOut: boolean;
}

export interface PlayerProfile {
  name: string;
  gender: 'Male' | 'Female' | 'Non-binary' | 'Other';
  orientation: 'Heterosexual' | 'Homosexual' | 'Bisexual' | 'Pansexual' | 'Asexual' | 'Other';
}

// --- Core Game State ---
export interface GameState {
  // 1. Original base fields
  characterSettings: CharacterProfile;
  worldview: string;
  history: ChatMessage[];
  isFirstRun: boolean;
  summary: string;
  turnsSinceLastSummary: number;
  playerProfile?: PlayerProfile;
  loadingMessages: string[];
  language: 'zh' | 'en';

  // 2. Core survival & economy values (TS-controlled)
  hp: number;             // (0-100)
  lives: number;          // Revival tokens, 0 = permanent death
  isGameOver: boolean;
  inventory: string[];    // Explicit backpack
  status: Record<string, any>; // Soft statuses only (e.g. wet, bleeding)

  // 3. Global map & spatial pointers
  worldData: WorldData | null;
  mapImageUrl: string | null;
  currentWorldId: string | null;
  currentNodeId: string | null;
  currentHouseId: string | null; // null = outdoors in Node

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
  hobbies: "",
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
  history: [],
  isFirstRun: true,
  summary: "",
  turnsSinceLastSummary: 0,
  loadingMessages: DEFAULT_LOADING_MESSAGES,
  language: 'zh',

  // Core survival
  hp: 100,
  lives: 3,
  isGameOver: false,
  inventory: [],
  status: {},

  // Spatial pointers
  worldData: null,
  mapImageUrl: null,
  currentWorldId: null,
  currentNodeId: null,
  currentHouseId: null,

  // Progress
  progressMap: {},

  // Pacing – start at tension 0 (absolute safety)
  pacingState: {
    tensionLevel: 0,
    turnsInCurrentLevel: 0
  },

  // Objective
  currentObjective: null
};
