/**
 * 管线编排器 (Pipeline Orchestrator)
 *
 * 按照固定顺序依次执行 10 个管线步骤，输出最终结算结果。
 * 每个步骤只读取和写入 PipelineContext，不直接修改 GameState。
 *
 * 执行顺序：
 *   ① 探索/赶路进度计算    → 确定活跃进度键、熔断检查
 *   ② D20 判定 + 好感度修正 → tier / effectiveRoll
 *   ③ 行为覆写              → 区域已满时屏蔽大失败
 *   ④ 位置解析与应用         → move/transit 位置变化
 *   ⑤ 紧张度升降            → 查表 tensionDelta
 *   ⑥ 安全区覆写            → safe zone T→0 / 非safe T≥1
 *   ⑦ 里程碑判定            → house→safe / node→boss T4
 *   ⑧ HP 结算               → 查表 hpDelta / safe 回血
 *   ⑨ 死亡结算              → 复活撤离 / gameOver
 *   ⑩ BGM + 叙事组装        → 选 BGM、拼接叙事指令
 */

import type { GameState, IntentResult } from '../../types/game';
import type { PipelineContext, PipelineResult } from './types';

import { stepProgressCalc } from './020_progressCalc';
import { stepD20Roll } from './040_d20Roll';
import { stepBehaviorOverride } from './060_behaviorOverride';
import { stepMoveResolve } from './080_moveResolve';
import { stepTensionDelta } from './100_tensionDelta';
import { stepSafeZoneOverride } from './120_safeZoneOverride';
import { stepMilestone } from './140_milestone';
import { stepHpSettlement } from './160_hpSettlement';
import { stepDeathSettlement } from './180_deathSettlement';
import { stepBgmAndNarrative } from './200_bgmAndNarrative';

/**
 * 初始化管线上下文：从当前 GameState 快照 + 意图 + D20 骰子创建
 */
function createContext(state: GameState, intent: IntentResult, d20Roll: number): PipelineContext {
  return {
    // 只读输入
    state,
    intent,

    // ① 进度
    activeProgressKey: '',
    newProgressMap: { ...state.progressMap },
    newTransitState: state.transitState,
    progressJustHit100: false,
    progressCapped: false,

    // ② D20
    rawRoll: d20Roll,
    effectiveRoll: d20Roll,
    tier: 1, // 默认普通，由 step② 覆盖
    affectionTriggered: null,
    formulaBreakdown: '',

    // ④ 位置
    moveTarget: null,
    moveSucceeded: false,
    newNodeId: state.currentNodeId,
    newHouseId: state.currentHouseId,

    // ⑤⑥ 紧张度
    newTensionLevel: state.pacingState.tensionLevel,
    tensionChanged: false,

    // ⑥ 安全区
    isInSafeZone: false,
    isNodeFullyExplored: false,

    // ⑦ 里程碑
    houseSafetyUpdate: null,

    // ⑧ HP
    newHp: state.hp,

    // ⑨ 死亡
    newLives: state.lives,
    newIsGameOver: false,
    deathEvacuated: false,

    // ⑩ BGM/叙事
    newInventory: [...state.inventory],
    isSuccess: false,
    narrativeInstruction: '',
    selectedBgmKey: undefined,

    // 调试
    debugFormula: '',
  };
}

/**
 * 从 PipelineContext 提取最终结果
 */
function extractResult(ctx: PipelineContext): PipelineResult {
  return {
    newHp: ctx.newHp,
    newLives: ctx.newLives,
    newTensionLevel: ctx.newTensionLevel,
    newNodeId: ctx.newNodeId,
    newHouseId: ctx.newHouseId,
    newProgressMap: ctx.newProgressMap,
    newInventory: ctx.newInventory,
    newIsGameOver: ctx.newIsGameOver,
    newTransitState: ctx.newTransitState,
    narrativeInstruction: ctx.narrativeInstruction,
    roll: ctx.rawRoll,
    isSuccess: ctx.isSuccess,
    houseSafetyUpdate: ctx.houseSafetyUpdate,
    affectionTriggered: ctx.affectionTriggered,
    formulaBreakdown: ctx.formulaBreakdown,
    tensionChanged: ctx.tensionChanged,
    selectedBgmKey: ctx.selectedBgmKey,
  };
}

/**
 * 执行完整管线
 * @param state   当前游戏状态快照（不可变）
 * @param intent  意图判定结果
 * @param d20Roll 本轮 D20 掷骰值 (1-20)
 * @returns 管线结算结果
 */
export function runPipeline(state: GameState, intent: IntentResult, d20Roll: number): PipelineResult {
  const ctx = createContext(state, intent, d20Roll);

  // ── 按顺序执行管线步骤 ──
  stepProgressCalc(ctx);       // ① 进度预检
  stepD20Roll(ctx);            // ② D20 + 好感度
  stepBehaviorOverride(ctx);   // ③ 行为覆写
  stepMoveResolve(ctx);        // ④ 位置解析
  stepTensionDelta(ctx);       // ⑤ 紧张度升降
  stepSafeZoneOverride(ctx);   // ⑥ 安全区覆写
  stepMilestone(ctx);          // ⑦ 里程碑判定
  stepHpSettlement(ctx);       // ⑧ HP 结算
  stepDeathSettlement(ctx);    // ⑨ 死亡结算
  stepBgmAndNarrative(ctx);    // ⑩ BGM + 叙事

  console.log('[Pipeline] 完成', {
    tier: ctx.tier,
    tension: `${state.pacingState.tensionLevel} → ${ctx.newTensionLevel}`,
    hp: `${state.hp} → ${ctx.newHp}`,
    location: `${state.currentNodeId}/${state.currentHouseId} → ${ctx.newNodeId}/${ctx.newHouseId}`,
    transit: ctx.newTransitState ? `${ctx.newTransitState.pathProgress}%` : 'null',
    bgm: ctx.selectedBgmKey,
  });

  return extractResult(ctx);
}
