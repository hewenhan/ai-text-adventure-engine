/**
 * Step ⑩ BGM 选择 + 叙事指令组装
 *
 * 职责：
 * - 根据 tensionChanged 决定是否切换 BGM
 * - 从对应紧张度的曲库中随机选取
 * - 组装最终的 narrativeInstruction（如果之前步骤还没生成的话）
 */

import type { PipelineContext } from './types';
import { BGM_LIST } from '../../types/game';
import { findNode, findHouse, getVisibleHouses } from './helpers';
import { TENSION_ROUTE } from '../tensionConfig';
import {
  buildT0Narrative, buildT1ExploreNarrative, buildT1CombatNarrative,
  buildT2Narrative, buildT3MoveNarrative, buildT3CombatNarrative,
  buildT4Narrative, buildTransitNarrative, buildArrivalNarrative,
  buildSafeExploreNarrative, buildSafeIdleNarrative, buildProgressCapNarrative,
} from './narratives';

export function stepBgmAndNarrative(ctx: PipelineContext): void {
  const { state, intent } = ctx;

  // ── BGM 选择 ──
  if (ctx.tensionChanged) {
    const candidates = BGM_LIST[ctx.newTensionLevel as keyof typeof BGM_LIST] || [];
    ctx.selectedBgmKey = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : undefined;
  } else {
    // 沿用上一轮 bgmKey
    for (let i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].bgmKey) {
        ctx.selectedBgmKey = state.history[i].bgmKey;
        break;
      }
    }
  }
  // Fallback：历史为空时按当前 tension 选
  if (!ctx.selectedBgmKey) {
    const fallback = BGM_LIST[ctx.newTensionLevel as keyof typeof BGM_LIST] || [];
    ctx.selectedBgmKey = fallback.length > 0
      ? fallback[Math.floor(Math.random() * fallback.length)]
      : undefined;
  }

  // ── 叙事指令组装 ──
  // 如果前面步骤（里程碑/死亡）已经写了叙事，就保留
  // 否则根据当前状态生成
  if (ctx.narrativeInstruction) return;

  const tension = state.pacingState.tensionLevel;
  const action = intent.intent;
  const roll = ctx.effectiveRoll;

  // ─ 进度熔断 ─
  if (ctx.progressCapped) {
    ctx.narrativeInstruction = buildProgressCapNarrative();
    ctx.isSuccess = true;
    return;
  }

  // ─ 赶路中 ─
  if (state.transitState) {
    if (!ctx.newTransitState && ctx.newNodeId !== state.currentNodeId) {
      // 抵达终点
      const toNode = findNode(state, ctx.newNodeId);
      const toName = toNode?.name || ctx.newNodeId || '未知地点';
      ctx.narrativeInstruction = buildArrivalNarrative(toName, roll);
    } else {
      // 仍在路上
      const transit = state.transitState;
      const fromNode = findNode(state, transit.fromNodeId);
      const toNode = findNode(state, transit.toNodeId);
      const pathProgress = ctx.newTransitState?.pathProgress ?? 0;
      ctx.narrativeInstruction = buildTransitNarrative(
        ctx.tier, roll, pathProgress,
        fromNode?.name || transit.fromNodeId,
        toNode?.name || transit.toNodeId,
        tension, ctx.newHp
      );
    }
    return;
  }

  // ─ 安全区 ─
  if (ctx.isInSafeZone && action !== 'move') {
    if (action === 'explore') {
      const progress = ctx.newProgressMap[ctx.activeProgressKey] || 0;
      const progressGain = ctx.tier === 2 ? 40 : 15;
      ctx.narrativeInstruction = buildSafeExploreNarrative(roll, progressGain, progress);
      ctx.isSuccess = true;
    } else {
      ctx.narrativeInstruction = buildSafeIdleNarrative();
      ctx.isSuccess = true;
    }
    return;
  }

  // ─ T0 非移动 ─
  if (tension === 0) {
    ctx.narrativeInstruction = buildT0Narrative(action, ctx.tier, roll, ctx.newHp);
    ctx.isSuccess = true;
    return;
  }

  // ─ move 叙事 ─
  if (action === 'move') {
    const mt = ctx.moveTarget;
    if (tension <= 1) {
      // 和平 move
      if (mt?.type === 'cross-node') {
        if (mt.fromBuilding) {
          ctx.narrativeInstruction = `【系统指令】：玩家走出当前建筑，准备前往【${mt.targetName}】。请描写走出建筑来到街区的场景。`;
        } else if (state.pacingState.tensionLevel === 0) {
          ctx.narrativeInstruction = '【系统强制】：玩家选择离开安全区，踏入外部世界。当前紧张度强制升至1级（探索态）。请描写出发踏上旅途的场景。';
        } else {
          ctx.narrativeInstruction = '【系统指令】：玩家踏上旅途，正在赶往新区域。请描写动身离开与旅途初段的见闻。';
        }
      } else if (mt?.type === 'enter-house') {
        ctx.narrativeInstruction = `【系统指令】：玩家进入${mt.house.name}。请描写进入该建筑的场景。`;
      } else if (mt?.type === 'exit-to-house') {
        ctx.narrativeInstruction = `【系统指令】：玩家走出当前建筑来到街区野外，正准备前往${mt.house.name}。请描写走出建筑的场景。`;
      } else if (mt?.type === 'exit-building') {
        ctx.narrativeInstruction = '【系统指令】：玩家退出当前建筑，回到街区野外。请描写走出建筑的场景。';
      } else if (mt?.type === 'unreachable') {
        ctx.narrativeInstruction = '【系统指令】：目标位置未揭盲或不可达。请描写找不到出路的场景。';
      } else {
        // tension === 1 且没有明确的移动目标
        ctx.narrativeInstruction = '【系统指令】：玩家想移动但未指定明确方向。请询问玩家要去哪里。';
      }
      return;
    }
    if (tension === 2) {
      if (mt?.type === 'cross-node') {
        if (mt.fromBuilding) {
          ctx.narrativeInstruction = `【系统强制 - 战术撤退】：玩家冲出当前建筑，准备朝【${mt.targetName}】方向撤离！Roll=${roll}，请描写冲出建筑的过程。`;
        } else {
          ctx.narrativeInstruction = `【系统强制 - 战术撤退】：玩家朝【${mt.targetName}】方向有序撤出！紧张度降回 1 级。Roll=${roll}，请描写安全撤离危机区域并踏上旅途的过程。`;
        }
      } else if (mt?.type === 'enter-house') {
        ctx.narrativeInstruction = `【系统强制 - 战术撤退】：玩家冲入【${mt.house.name}】躲避！紧张度降回 1 级。Roll=${roll}，请描写逃入建筑的过程。`;
      } else if (mt?.type === 'exit-to-house' || mt?.type === 'exit-building') {
        ctx.narrativeInstruction = `【系统强制 - 战术撤退】：玩家冲出建筑逃到街区！紧张度降回 1 级。Roll=${roll}，请描写逃出建筑的过程。`;
      } else {
        ctx.narrativeInstruction = buildT2Narrative(action, ctx.tier, roll, ctx.newHp);
      }
      return;
    }
    if (tension === 3) {
      if (state.currentHouseId) {
        if (ctx.tier === 0) {
          ctx.narrativeInstruction = `【系统指令 - 逃跑受阻】：试图冲出建筑，却被堵在了门口！遭受重击，HP降至${ctx.newHp}。被逼退回建筑内部，维持 3 级紧张度。`;
        } else {
          ctx.narrativeInstruction = `【系统指令 - 破门而出】：玩家拼命冲出了建筑来到街区！Roll=${roll}，请描写慌不择路冲出建筑的惊险场面。`;
        }
      } else {
        const canMove = mt?.type === 'cross-node' || mt?.type === 'enter-house' || mt?.type === 'exit-to-house';
        if (!canMove) {
          ctx.narrativeInstruction = `【系统指令 - 慌不择路】：试图逃跑，却在恐慌中冲向了死胡同或无法到达的区域！遭到敌人背后猛击，HP-20（当前${ctx.newHp}）。被逼回原地，维持 3 级紧张度。`;
        } else {
          const targetName = mt?.type === 'cross-node' ? mt.targetName
            : (mt?.type === 'enter-house' || mt?.type === 'exit-to-house') ? mt.house.name
            : '安全地带';
          ctx.narrativeInstruction = buildT3MoveNarrative(ctx.tier, roll, ctx.newHp, targetName);
        }
      }
      return;
    }
    if (tension === 4) {
      ctx.narrativeInstruction = buildT4Narrative('move', ctx.tier, roll, ctx.newHp);
      return;
    }
  }

  // ─ T1 非 move ─
  if (tension === 1) {
    if (action === 'explore') {
      const progress = ctx.newProgressMap[ctx.activeProgressKey] || 0;
      ctx.narrativeInstruction = buildT1ExploreNarrative(ctx.tier, roll, progress);
      ctx.isSuccess = ctx.tier > 0;
    } else {
      ctx.narrativeInstruction = buildT1CombatNarrative(ctx.tier, roll);
      ctx.isSuccess = ctx.tier > 0;
    }
    return;
  }

  // ─ T2 非 move ─
  if (tension === 2) {
    ctx.narrativeInstruction = buildT2Narrative(action, ctx.tier, roll, ctx.newHp);
    ctx.isSuccess = ctx.tier > 0;
    return;
  }

  // ─ T3 非 move ─
  if (tension === 3) {
    if (action === 'idle' || action === 'suicidal_idle') {
      ctx.narrativeInstruction = `【系统大失败 - 找死】：面对精英威胁居然发呆！惨遭重击，HP -25，被逼入绝境，紧张度升至 4 级（死斗）。请描写极度惨烈的受击场面。`;
      ctx.isSuccess = false;
    } else {
      ctx.narrativeInstruction = buildT3CombatNarrative(ctx.tier, roll);
      ctx.isSuccess = ctx.tier >= 1;
    }
    return;
  }

  // ─ T4 ─
  if (tension === 4) {
    ctx.narrativeInstruction = buildT4Narrative(action, ctx.tier, roll, ctx.newHp);
    ctx.isSuccess = ctx.tier === 2 && action === 'combat';
    return;
  }
}
