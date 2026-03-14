/**
 * Step ⑥ 安全区覆写
 *
 * 职责：
 * - 基于 **新位置**（step ④ 确定后）判定是否处于安全区
 * - safe 区域 → 强制 T→0
 * - 非 safe + T===0 → 强制 T=1（修复从 safe house 出来仍为 T0 的 bug）
 * - 赶路抵达目的地时：根据目的地安全度覆写紧张度
 * - 记录 isInSafeZone / isNodeFullyExplored 供后续步骤使用
 */

import type { PipelineContext } from './types';
import { findNode, findHouse } from './helpers';

export function stepSafeZoneOverride(ctx: PipelineContext): void {
  const { state } = ctx;

  // ── 赶路抵达终点时的特殊处理 ──
  if (state.transitState && !ctx.newTransitState && ctx.newNodeId !== state.currentNodeId) {
    // 刚从赶路中抵达新节点
    const toNode = findNode(state, ctx.newNodeId);
    if (toNode?.safetyLevel === 'safe') {
      ctx.newTensionLevel = 0;
      ctx.isInSafeZone = true;
    } else {
      ctx.newTensionLevel = 1;
      ctx.isInSafeZone = false;
    }
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
    return;
  }

  // ── 仍在赶路中：不做安全区覆写 ──
  if (ctx.newTransitState) {
    ctx.isInSafeZone = false;
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
    return;
  }

  // ── 基于新位置判定安全区 ──
  const newNode = findNode(state, ctx.newNodeId);
  const newHouse = findHouse(newNode, ctx.newHouseId);

  const inSafeHouse = !!(newHouse && newHouse.safetyLevel === 'safe');
  const inSafeNode = !!(newNode && newNode.safetyLevel === 'safe');
  ctx.isInSafeZone = inSafeHouse || inSafeNode;

  // 区域探索度是否已满（用于后续里程碑等判定）
  const nodeKey = ctx.newNodeId ? `node_${ctx.newNodeId}` : '';
  const nodeProgress = nodeKey ? (ctx.newProgressMap[nodeKey] || 0) : 0;
  ctx.isNodeFullyExplored = nodeProgress >= 100 && !ctx.newHouseId;

  // ── 安全区 → T0 ──
  if (ctx.isInSafeZone) {
    ctx.newTensionLevel = 0;
  }
  // ── 非安全区 + 当前 T===0 → 至少 T1 ──
  // 修复：从 safe house 出来后不会卡在 T0
  else if (ctx.newTensionLevel === 0) {
    ctx.newTensionLevel = 1;
  }

  ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
}
