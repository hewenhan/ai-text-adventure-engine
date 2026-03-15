/**
 * Step ⑦ 里程碑判定
 *
 * 职责：
 * - 检测探索度是否在本轮首次跨过 100%
 * - safe 区域：不触发 BOSS，直接完成
 * - house 100% → 根据 safetyLevel 创建持久 BOSS（或直接标记 safe）
 * - node 100% → 根据 safetyLevel 创建持久 BOSS（或直接标记完成）
 * - BOSS 映射: safe→无, low→T2, medium→T2, high→T3, deadly→T4
 */

import type { PipelineContext } from './types';
import { findNode, findHouse } from './helpers';
import { bossTensionFromSafety } from '../../types/game';

export function stepMilestone(ctx: PipelineContext): void {
  // 只有本轮进度刚跨过 100% 才触发
  if (!ctx.progressJustHit100) return;

  // 赶路中不触发里程碑
  if (ctx.newTransitState || ctx.state.transitState) return;

  const { state } = ctx;
  const node = findNode(state, ctx.newNodeId);

  if (state.currentHouseId) {
    // ── house 探索度 100% ──
    const house = findHouse(node, state.currentHouseId);
    const safety = house?.safetyLevel || 'safe';
    const bossTension = bossTensionFromSafety(safety);

    if (!bossTension) {
      // safe 建筑：直接标记完成 + 必出装备
      ctx.newTensionLevel = 0;
      ctx.houseSafetyUpdate = { houseId: state.currentHouseId, newSafetyLevel: 'safe' };
      ctx.isInSafeZone = true;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.guaranteedDrop = 'milestone';
      ctx.narrativeInstruction += '\n【系统强制 - 里程碑】：该建筑已被彻底搜索，确认安全无威胁。主角可安心休整。';
    } else {
      // 有威胁建筑：创建持久 BOSS
      ctx.bossSpawn = {
        locationKey: `house_${state.currentHouseId}`,
        boss: { tensionLevel: bossTension },
      };
      ctx.newTensionLevel = bossTension;
      ctx.inBossZone = true;
      ctx.isInSafeZone = false;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.narrativeInstruction += `\n【系统强制 - 里程碑 BOSS】：建筑探索度满！深处蛰伏的首领被惊动，紧张度强制升至 ${bossTension} 级！必须击败首领才能将此处变为安全屋。逃离后首领不会消失，下次进入将再次遭遇。`;
    }
  } else {
    // ── node 探索度 100% ──
    const safety = node?.safetyLevel || 'safe';
    const bossTension = bossTensionFromSafety(safety);

    if (!bossTension) {
      // safe 区域：直接完成 + 必出装备
      ctx.newTensionLevel = 0;
      ctx.isInSafeZone = true;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.guaranteedDrop = 'milestone';
      ctx.narrativeInstruction += '\n【系统强制 - 里程碑】：区域已被彻底探索，确认安全无威胁。';
    } else {
      // 有威胁区域：创建持久 BOSS
      ctx.bossSpawn = {
        locationKey: `node_${state.currentNodeId}`,
        boss: { tensionLevel: bossTension },
      };
      ctx.newTensionLevel = bossTension;
      ctx.inBossZone = true;
      ctx.isInSafeZone = false;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.narrativeInstruction += `\n【系统强制 - 里程碑 BOSS】：区域探索度满！惊动了统治该区域的核心威胁，紧张度强制升至 ${bossTension} 级！必须击败区域首领才能肃清此地。离开后首领不会消失，返回将再次遭遇。`;
    }
  }
}
