/**
 * Step ⑨ 死亡结算
 *
 * 职责：
 * - HP≤0 + lives>0 → 消耗一条命，HP=20，T→1，传送撤离
 * - HP≤0 + lives===0 → gameOver
 * - 死亡撤离：传送到最近的安全节点或 transit.fromNodeId
 * - 死亡后覆盖里程碑结果（不会复活在 boss 战里）
 */

import type { PipelineContext } from './types';
import { findNode } from './helpers';
import { buildDeathReviveNarrative, buildGameOverNarrative } from './narratives';

/**
 * 寻找最近的安全撤离点
 * 优先级：① transit.fromNodeId  ② 当前节点连接中 safetyLevel='safe' 的  ③ 当前节点连接中第一个
 */
function findEvacuationNodeId(ctx: PipelineContext): string | null {
  const { state } = ctx;

  // 如果在赶路中，撤回出发点
  if (state.transitState) {
    return state.transitState.fromNodeId;
  }

  // 查找连接的安全节点
  const currentNode = findNode(state, state.currentNodeId);
  if (currentNode && state.worldData) {
    const safeNeighbor = currentNode.connections
      .map(id => state.worldData!.nodes.find(n => n.id === id))
      .find(n => n && n.safetyLevel === 'safe');
    if (safeNeighbor) return safeNeighbor.id;

    // 没有安全节点，撤到第一个相邻节点
    if (currentNode.connections.length > 0) {
      return currentNode.connections[0];
    }
  }

  // 兜底：留在原地
  return state.currentNodeId;
}

export function stepDeathSettlement(ctx: PipelineContext): void {
  if (ctx.newHp > 0) return;

  if (ctx.state.lives > 0) {
    // ── 消耗复活币，锁血复活 ──
    ctx.newLives = ctx.state.lives - 1;
    ctx.newHp = 20;
    ctx.newTensionLevel = 1;
    ctx.deathEvacuated = true;

    // ── 撤离到安全地点 ──
    const evacNodeId = findEvacuationNodeId(ctx);
    ctx.newNodeId = evacNodeId;
    ctx.newHouseId = null;
    ctx.newTransitState = null; // 清除赶路状态

    ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;

    // 叙事：死亡复活在最前面
    const evacNode = findNode(ctx.state, evacNodeId);
    const evacName = evacNode?.name || '附近';
    ctx.narrativeInstruction = buildDeathReviveNarrative(ctx.newLives)
      + `撤离到了【${evacName}】。`
      + ctx.narrativeInstruction;
  } else {
    // ── 彻底死亡 ──
    ctx.newIsGameOver = true;
    ctx.newHp = 0;
    ctx.narrativeInstruction = buildGameOverNarrative();
  }
}
