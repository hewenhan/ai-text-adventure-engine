/**
 * Step ④ 位置解析与应用
 *
 * 职责：
 * - 解析 move 意图的目标（跨节点/进建筑/出建筑等）
 * - 根据 D20 tier 决定 move 是否成功
 * - 成功时应用位置变化（newNodeId / newHouseId / newTransitState）
 * - 处理赶路中的路程推进（transit pathProgress）
 * - 对于非 move 的 explore 行为，应用进度增量
 */

import type { PipelineContext, MoveTarget } from './types';
import type { GameState, NodeData, IntentResult, HouseData } from '../../types/game';
import { TENSION_ROUTE } from '../tensionConfig';
import { findNode, getVisibleHouses } from './helpers';

/**
 * 解析 move 意图的目标位置
 */
function resolveMoveTarget(
  state: GameState,
  intent: IntentResult,
  currentNode: NodeData | undefined
): MoveTarget {
  const targetId = intent.targetId;

  // 跨节点移动
  if (targetId && currentNode?.connections.includes(targetId)) {
    const targetNode = findNode(state, targetId);
    return {
      type: 'cross-node',
      targetNodeId: targetId,
      targetName: targetNode?.name || targetId,
      fromBuilding: !!state.currentHouseId,
    };
  }

  // 进入/切换建筑
  if (targetId && currentNode) {
    const visibleHouses = getVisibleHouses(currentNode);
    const targetHouse = visibleHouses.find(h => h.id === targetId);
    if (targetHouse) {
      if (state.currentHouseId && state.currentHouseId !== targetId) {
        return { type: 'exit-to-house', house: targetHouse };
      }
      return { type: 'enter-house', house: targetHouse };
    }
    return { type: 'unreachable' };
  }

  // 无目标时退出建筑
  if (state.currentHouseId) {
    return { type: 'exit-building' };
  }

  return { type: 'no-target' };
}

export function stepMoveResolve(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;
  const action = intent.intent;
  const currentNode = findNode(state, state.currentNodeId);

  // ─── 赶路中的路程推进 ─────
  if (state.transitState) {
    const transit = state.transitState;
    // 路程推进量由 tier 决定
    const progressGain = ctx.tier === 0 ? 0 : (ctx.tier === 1 ? 25 : 50);
    const newPathProgress = Math.min(100, transit.pathProgress + progressGain);

    if (newPathProgress >= 100) {
      // 抵达终点
      ctx.newTransitState = null;
      ctx.newNodeId = transit.toNodeId;
      ctx.newHouseId = null;
      ctx.moveSucceeded = true;
    } else {
      // 仍在路上
      ctx.newTransitState = {
        fromNodeId: transit.fromNodeId,
        toNodeId: transit.toNodeId,
        pathProgress: newPathProgress,
        lockedTheme: transit.lockedTheme || null,
      };
    }
    ctx.isSuccess = ctx.tier > 0;
    return;
  }

  // ─── explore 进度增量 ─────
  if (action === 'explore' && !ctx.progressCapped) {
    const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);
    const inSafeHouse = currentHouse && currentHouse.safetyLevel === 'safe';
    const inSafeNode = currentNode && currentNode.safetyLevel === 'safe';
    const isSafe = !!(inSafeHouse || inSafeNode);

    const oldProgress = ctx.newProgressMap[ctx.activeProgressKey] || 0;

    if (isSafe) {
      // 安全区探索进度：普通+15, 大成功+40
      const progressGain = ctx.tier === 2 ? 40 : 15;
      ctx.newProgressMap[ctx.activeProgressKey] = Math.min(
        100,
        (ctx.newProgressMap[ctx.activeProgressKey] || 0) + progressGain
      );
    } else if (tension === 1) {
      // T1 探索进度：由 tensionConfig 决定
      const route = TENSION_ROUTE[1]?.['explore'];
      if (route) {
        const progressGain = route.progressDelta[ctx.tier];
        ctx.newProgressMap[ctx.activeProgressKey] = Math.min(
          100,
          (ctx.newProgressMap[ctx.activeProgressKey] || 0) + progressGain
        );
      }
    }
    // T2+ 的 explore/combat 不增加进度

    // 检查进度是否刚跨过 100%
    const newProgress = ctx.newProgressMap[ctx.activeProgressKey] || 0;
    if (newProgress >= 100 && oldProgress < 100) {
      ctx.progressJustHit100 = true;
    }
  }

  // ─── move 位置解析 ─────
  if (action !== 'move') {
    ctx.moveTarget = null;
    return;
  }

  const mt = resolveMoveTarget(state, intent, currentNode);
  ctx.moveTarget = mt;

  // ── T0/T1 和平移动：无条件成功 ──
  if (tension <= 1) {
    switch (mt.type) {
      case 'cross-node':
        if (mt.fromBuilding) {
          // 先出建筑
          ctx.newHouseId = null;
          ctx.moveSucceeded = true;
          ctx.isSuccess = true;
        } else {
          // 踏上旅途
          ctx.newTransitState = {
            fromNodeId: state.currentNodeId!,
            toNodeId: mt.targetNodeId,
            pathProgress: 0,
            lockedTheme: null,
          };
          ctx.newHouseId = null;
          ctx.moveSucceeded = true;
          ctx.isSuccess = true;
        }
        break;
      case 'enter-house':
        ctx.newHouseId = mt.house.id;
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
        break;
      case 'exit-to-house':
        // 先出当前建筑（下一轮再进目标建筑）
        ctx.newHouseId = null;
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
        break;
      case 'exit-building':
        ctx.newHouseId = null;
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
        break;
      case 'unreachable':
        ctx.moveSucceeded = false;
        ctx.isSuccess = false;
        break;
      case 'no-target':
        ctx.moveSucceeded = false;
        ctx.isSuccess = false;
        break;
    }
    return;
  }

  // ── T2 战术撤退：无条件成功（tensionConfig 保证 [0, 1, 0]） ──
  if (tension === 2) {
    switch (mt.type) {
      case 'cross-node':
        if (mt.fromBuilding) {
          ctx.newHouseId = null;
        } else {
          ctx.newTransitState = {
            fromNodeId: state.currentNodeId!,
            toNodeId: mt.targetNodeId,
            pathProgress: 5,
            lockedTheme: null,
          };
          ctx.newHouseId = null;
        }
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
        break;
      case 'enter-house':
        ctx.newHouseId = mt.house.id;
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
        break;
      case 'exit-to-house':
      case 'exit-building':
        ctx.newHouseId = null;
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
        break;
      default:
        ctx.moveSucceeded = false;
        ctx.isSuccess = false;
        break;
    }
    return;
  }

  // ── T3 逃跑：依赖 D20 结果 ──
  if (tension === 3) {
    if (state.currentHouseId) {
      // 在建筑内：先冲出建筑
      if (ctx.tier === 0) {
        // 大失败：被堵门
        ctx.moveSucceeded = false;
        ctx.isSuccess = false;
      } else {
        // 普通/大成功：冲出建筑
        ctx.newHouseId = null;
        ctx.moveSucceeded = true;
        ctx.isSuccess = ctx.tier === 2;
      }
    } else {
      // 野外：尝试向目标撤退
      const canMove = mt.type === 'cross-node' || mt.type === 'enter-house' || mt.type === 'exit-to-house';
      if (!canMove) {
        // 目标不可达：慌不择路
        ctx.moveSucceeded = false;
        ctx.isSuccess = false;
      } else if (ctx.tier === 2) {
        // 大成功：极限逃生，踏上旅途
        const nextNodeId = mt.type === 'cross-node' ? mt.targetNodeId : state.currentNodeId;
        ctx.newTransitState = {
          fromNodeId: state.currentNodeId!,
          toNodeId: nextNodeId!,
          pathProgress: 50,
          lockedTheme: null,
        };
        ctx.moveSucceeded = true;
        ctx.isSuccess = true;
      } else {
        // 失败/普通：突围失败
        ctx.moveSucceeded = false;
        ctx.isSuccess = false;
      }
    }
    return;
  }

  // ── T4：逃跑必定失败 ──
  if (tension === 4) {
    ctx.moveSucceeded = false;
    ctx.isSuccess = false;
  }
}
