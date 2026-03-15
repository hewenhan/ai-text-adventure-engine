/**
 * 管线共享类型定义
 * 所有 pipeline step 读写的中间状态都在这里定义
 */

import type { GameState, IntentResult, SafetyLevel, HouseData, NodeData, ActiveBoss, InventoryItem } from '../../types/game';

// ─── D20 掷骰结果档位 ───
export type RollTier = 0 | 1 | 2; // 0=大失败, 1=普通, 2=大成功

// ─── 移动目标解析结果 ───
export type MoveTarget =
  | { type: 'cross-node'; targetNodeId: string; targetName: string; fromBuilding: boolean }
  | { type: 'enter-house'; house: HouseData }
  | { type: 'exit-to-house'; house: HouseData }
  | { type: 'exit-building' }
  | { type: 'unreachable' }
  | { type: 'no-target' };

// ─── 管线上下文：所有 step 共享的可变状态 ───
export interface PipelineContext {
  /** 只读：当前游戏快照（不可变异） */
  readonly state: GameState;
  /** 只读：本轮意图判定结果 */
  readonly intent: IntentResult;

  // ── ① 进度计算结果 ──
  /** 本轮活跃的进度键（如 "node_n1" / "house_h2_1"） */
  activeProgressKey: string;
  /** 更新后的进度表（浅拷贝） */
  newProgressMap: Record<string, number>;
  /** 赶路状态（null=不在赶路中） */
  newTransitState: GameState['transitState'];
  /** 本轮进度是否刚跨过 100%（用于里程碑判定） */
  progressJustHit100: boolean;
  /** 进度熔断：该区域已 100%，不允许继续 explore */
  progressCapped: boolean;

  // ── ② D20 判定结果 ──
  /** 原始 D20 掷骰 (1-20) */
  rawRoll: number;
  /** 经好感度修正后的有效 Roll */
  effectiveRoll: number;
  /** 结果档位：0=大失败, 1=普通, 2=大成功 */
  tier: RollTier;
  /** 好感度触发类型 */
  affectionTriggered: 'aid' | 'sabotage' | null;
  /** 公式分解字符串（调试用） */
  formulaBreakdown: string;

  // ── ③ 行为覆写 ──
  // （直接修改 tier，无额外字段）

  // ── ④ 位置解析 ──
  /** move 操作的目标解析结果 */
  moveTarget: MoveTarget | null;
  /** move 是否成功（由 D20 tier 决定） */
  moveSucceeded: boolean;
  /** 结算后的节点 ID */
  newNodeId: string | null;
  /** 结算后的建筑 ID（null=户外） */
  newHouseId: string | null;

  // ── ⑤ 紧张度 ──
  /** 结算后的紧张度等级 */
  newTensionLevel: 0 | 1 | 2 | 3 | 4;
  /** 紧张度是否发生了变化 */
  tensionChanged: boolean;

  // ── ⑥ 安全区覆写 ──
  /** 当前位置是否处于安全区 */
  isInSafeZone: boolean;


  // ── ⑦ 里程碑 ──
  /** house 安全等级变更（探索度满 → safe） */
  houseSafetyUpdate: { houseId: string; newSafetyLevel: SafetyLevel } | null;
  // ── BOSS 战 ──
  /** 本回合新创建的 BOSS（探索度满触发） */
  bossSpawn: { locationKey: string; boss: ActiveBoss } | null;
  /** 本回合被击败的 BOSS 位置键（node_xxx / house_xxx） */
  bossDefeatedKey: string | null;
  /** 当前位置是否存在活跃 BOSS */
  inBossZone: boolean;
  /** 必出装备掉落标志（milestone=安全区满探索, boss=BOSS击败） */
  guaranteedDrop: 'milestone' | 'boss' | null;
  // ── ⑧ HP 结算 ──
  newHp: number;
  /** 防具减伤比例（0-80），由最强防具决定 */
  armorReduction: number;

  // ── ⑧½ 退敌道具 ──
  /** 本回合是否消耗了退敌道具免罚 */
  escapeItemUsed: InventoryItem | null;

  // ── ⑨ 死亡结算 ──
  newLives: number;
  newIsGameOver: boolean;


  // ── ⑩ 任务/BGM/叙事 ──
  newInventory: InventoryItem[];
  /** 本轮是否判定为成功（影响叙事语气） */
  isSuccess: boolean;
  /** 叙事指令（发给 LLM 的系统指示） */
  narrativeInstruction: string;
  /** 选中的 BGM key */
  selectedBgmKey: string | undefined;
  /** 武器 buff 百分比（最强武器），用于 combat 失败概率降低 */
  weaponBuff: number;

  // ── 调试信息 ──
  debugFormula: string;
}

/**
 * 管线最终输出：useChatLogic 消费的结果
 */
export interface PipelineResult {
  newHp: number;
  newLives: number;
  newTensionLevel: 0 | 1 | 2 | 3 | 4;
  newNodeId: string | null;
  newHouseId: string | null;
  newProgressMap: Record<string, number>;
  newInventory: InventoryItem[];
  newIsGameOver: boolean;
  newTransitState: GameState['transitState'];
  narrativeInstruction: string;
  roll: number;
  isSuccess: boolean;
  houseSafetyUpdate: { houseId: string; newSafetyLevel: SafetyLevel } | null;
  bossSpawn: { locationKey: string; boss: ActiveBoss } | null;
  bossDefeatedKey: string | null;
  inBossZone: boolean;
  guaranteedDrop: 'milestone' | 'boss' | null;
  affectionTriggered: 'aid' | 'sabotage' | null;
  formulaBreakdown: string;
  tensionChanged: boolean;
  selectedBgmKey: string | undefined;
}
