/**
 * Step ⑦ 里程碑判定
 *
 * 职责：
 * - 检测探索度是否在本轮首次跨过 100%
 * - house 100% → T→0 + 标记 house 为 safe
 * - node 100% → T→4（boss 出现），直接覆盖当前紧张度
 * - 不再要求 T===1 才能触发（修复大失败冲上 100% 时 boss 失灵的问题）
 */

import type { PipelineContext } from './types';

export function stepMilestone(ctx: PipelineContext): void {
  // 只有本轮进度刚跨过 100% 才触发
  if (!ctx.progressJustHit100) return;

  // 赶路中不触发里程碑
  if (ctx.newTransitState || ctx.state.transitState) return;

  const { state } = ctx;

  if (state.currentHouseId) {
    // ── house 探索度 100% → 变为 safe, T→0 ──
    ctx.newTensionLevel = 0;
    ctx.houseSafetyUpdate = {
      houseId: state.currentHouseId,
      newSafetyLevel: 'safe',
    };
    ctx.isInSafeZone = true;
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
    ctx.narrativeInstruction += '\n【系统强制 - 里程碑】：该建筑威胁已被彻底肃清，变为安全屋，主角可安心休整。';
  } else {
    // ── node 探索度 100% → 触发 boss（T→4），直接覆盖 ──
    ctx.newTensionLevel = 4;
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
    ctx.narrativeInstruction += '\n【系统强制 - 里程碑】：区域探索度满！惊动了统治该区域的核心危机，进入死斗！';
  }
}
