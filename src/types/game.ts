export interface DebugState {
  lastActionRoll: number;
  lastSuccessThreshold: number;
  lastIsSuccess: boolean;
  lastTensionLevel: number;
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

export interface GameState {
  characterSettings: CharacterProfile;
  worldview: string;
  history: ChatMessage[];
  status: Record<string, any>;
  isFirstRun: boolean;
  summary: string;
  turnsSinceLastSummary: number;
  playerProfile?: PlayerProfile;
  loadingMessages: string[];
  language: 'zh' | 'en';
  pacingState: {
    tensionLevel: 0 | 1 | 2 | 3 | 4;
    turnsInCurrentLevel: number;
  };
}

export interface PlayerProfile {
  name: string;
  gender: 'Male' | 'Female' | 'Non-binary' | 'Other';
  orientation: 'Heterosexual' | 'Homosexual' | 'Bisexual' | 'Pansexual' | 'Asexual' | 'Other';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageFileName?: string; // Only the filename in Drive
  timestamp: number;
  // Snapshot of game state AFTER this message was processed
  pacingState?: {
    tensionLevel: 0 | 1 | 2 | 3 | 4;
    turnsInCurrentLevel: number;
  };
  status?: Record<string, any>;
  currentSceneVisuals?: string;
  debugState?: DebugState;
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
  status: { health: 100, inventory: [] },
  isFirstRun: true,
  summary: "",
  turnsSinceLastSummary: 0,
  loadingMessages: DEFAULT_LOADING_MESSAGES,
  language: 'zh',
  pacingState: {
    tensionLevel: 1,
    turnsInCurrentLevel: 0
  }
};
