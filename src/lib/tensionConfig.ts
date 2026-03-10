export type RollOutcome = 'CRITICAL_FAIL' | 'FAIL' | 'DRAW' | 'SUCCESS' | 'CRITICAL_SUCCESS';

export interface RouteDef {
  probabilities: [number, number, number]; // [大失败, 普通/僵持, 大成功]，三者之和应为 1
  outcomes: [RollOutcome, RollOutcome, RollOutcome];
  hpDelta: [number, number, number];
  tensionDelta: [number, number, number]; // 相对紧张度的增减
  progressDelta: [number, number, number];
}

// 完整配置表：tension level → action → RouteDef
// probabilities 代表 [大失败概率, 普通概率, 大成功概率]
export const TENSION_ROUTE: Record<number, Record<string, RouteDef>> = {
  // ─── Tension 0 (Safe zone / Spawn) ─────
  0: {
    default: {
      probabilities: [0, 0.9, 0.1],
      outcomes: ['SUCCESS', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [0, 5, 15],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
    move: {
      probabilities: [0, 0.9, 0.1],
      outcomes: ['SUCCESS', 'SUCCESS', 'SUCCESS'],
      hpDelta: [0, 0, 0],
      tensionDelta: [0, 1, 1], // 离开安全区 → 升为 T1
      progressDelta: [0, 0, 0],
    },
  },

  // ─── Tension 1 (Exploration / Progress accumulation) ─────
  1: {
    explore: {
      probabilities: [0.15, 0.65, 0.20],
      outcomes: ['CRITICAL_FAIL', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [0, 0, 0],
      tensionDelta: [1, 0, 0], // 伏击导致升 T2
      progressDelta: [0, 15, 40],
    },
    move: {
      probabilities: [0, 1, 0],
      outcomes: ['SUCCESS', 'SUCCESS', 'SUCCESS'],
      hpDelta: [0, 0, 0],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
    combat: {
      probabilities: [0.25, 0.55, 0.20],
      outcomes: ['CRITICAL_FAIL', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [0, 0, 0],
      tensionDelta: [1, 0, 0],
      progressDelta: [0, 0, 0],
    },
    default: {
      probabilities: [0, 0.9, 0.1],
      outcomes: ['SUCCESS', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [0, 0, 0],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
  },

  // ─── Tension 2 (轻度危机 - 杂兵/陷阱) ─────
  2: {
    move: {
      // 战术撤退：无条件成功
      probabilities: [0, 1, 0],
      outcomes: ['SUCCESS', 'SUCCESS', 'SUCCESS'],
      hpDelta: [0, 0, 0],
      tensionDelta: [0, -1, 0], // 降回 T1
      progressDelta: [0, 0, 0],
    },
    idle: {
      // 发呆：纯惩罚
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-15, -15, -15],
      tensionDelta: [1, 1, 1], // 升至 T3
      progressDelta: [0, 0, 0],
    },
    suicidal_idle: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-15, -15, -15],
      tensionDelta: [1, 1, 1],
      progressDelta: [0, 0, 0],
    },
    combat: {
      probabilities: [0.20, 0.60, 0.20],
      outcomes: ['CRITICAL_FAIL', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [-10, 0, 0],
      tensionDelta: [1, -1, -1], // 失败升 T3，成功降 T1
      progressDelta: [0, 0, 0],
    },
    explore: {
      probabilities: [0.20, 0.60, 0.20],
      outcomes: ['CRITICAL_FAIL', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [-10, 0, 0],
      tensionDelta: [1, -1, -1],
      progressDelta: [0, 0, 0],
    },
    default: {
      probabilities: [0.20, 0.60, 0.20],
      outcomes: ['CRITICAL_FAIL', 'SUCCESS', 'CRITICAL_SUCCESS'],
      hpDelta: [-10, 0, 0],
      tensionDelta: [1, -1, -1],
      progressDelta: [0, 0, 0],
    },
  },

  // ─── Tension 3 (中度危机 - 精英怪/绝境) ─────
  3: {
    move: {
      probabilities: [0.30, 0.60, 0.10],
      outcomes: ['CRITICAL_FAIL', 'FAIL', 'CRITICAL_SUCCESS'],
      hpDelta: [-20, -10, 0],
      tensionDelta: [0, 0, -2], // 大成功降至 T1
      progressDelta: [0, 0, 0],
    },
    idle: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-25, -25, -25],
      tensionDelta: [1, 1, 1], // 升至 T4
      progressDelta: [0, 0, 0],
    },
    suicidal_idle: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-25, -25, -25],
      tensionDelta: [1, 1, 1],
      progressDelta: [0, 0, 0],
    },
    combat: {
      probabilities: [0.25, 0.50, 0.25],
      outcomes: ['CRITICAL_FAIL', 'DRAW', 'CRITICAL_SUCCESS'],
      hpDelta: [-25, 0, 0],
      tensionDelta: [1, 0, -2], // 失败升 T4，成功降 T1
      progressDelta: [0, 0, 0],
    },
    explore: {
      probabilities: [0.25, 0.50, 0.25],
      outcomes: ['CRITICAL_FAIL', 'DRAW', 'CRITICAL_SUCCESS'],
      hpDelta: [-25, 0, 0],
      tensionDelta: [1, 0, -2],
      progressDelta: [0, 0, 0],
    },
    default: {
      probabilities: [0.25, 0.50, 0.25],
      outcomes: ['CRITICAL_FAIL', 'DRAW', 'CRITICAL_SUCCESS'],
      hpDelta: [-25, 0, 0],
      tensionDelta: [1, 0, -2],
      progressDelta: [0, 0, 0],
    },
  },

  // ─── Tension 4 (Boss / Death-lock) ─────
  4: {
    move: {
      // 逃跑失败：纯惩罚
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-30, -30, -30],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
    combat: {
      probabilities: [0.40, 0.50, 0.10],
      outcomes: ['CRITICAL_FAIL', 'DRAW', 'CRITICAL_SUCCESS'],
      hpDelta: [-40, 0, 0],
      tensionDelta: [0, 0, -4], // 大成功降至 T0
      progressDelta: [0, 0, 0],
    },
    idle: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-50, -50, -50],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
    suicidal_idle: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-50, -50, -50],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
    explore: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-50, -50, -50],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
    default: {
      probabilities: [1, 0, 0],
      outcomes: ['CRITICAL_FAIL', 'CRITICAL_FAIL', 'CRITICAL_FAIL'],
      hpDelta: [-50, -50, -50],
      tensionDelta: [0, 0, 0],
      progressDelta: [0, 0, 0],
    },
  },
};
