/**
 * Step 2.5+: 管线结果 + Debug 覆写 → 统一写入 GameState
 */

import type { GameState, DebugOverrides } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import { applyProgressAndReveals } from '../../lib/pipeline';
import type { DirectorResult } from './directorSystem';

/**
 * 消费 Debug 覆写，修改 resolution（mutate in place）
 */
export function applyDebugOverrides(resolution: PipelineResult, debugOv: DebugOverrides): void {
  if (debugOv.tensionLevel !== undefined) {
    resolution.tensionChanged = resolution.newTensionLevel !== debugOv.tensionLevel;
    resolution.newTensionLevel = debugOv.tensionLevel;
  }
  if (debugOv.hp !== undefined) resolution.newHp = Math.max(0, Math.min(100, debugOv.hp));
  if (debugOv.lives !== undefined) resolution.newLives = Math.max(0, debugOv.lives);
  if (debugOv.teleportNodeId) {
    resolution.newNodeId = debugOv.teleportNodeId;
    resolution.newHouseId = debugOv.teleportHouseId ?? null;
    resolution.newTransitState = null;
  }
  if (debugOv.progressOverride) {
    resolution.newProgressMap = {
      ...resolution.newProgressMap,
      [debugOv.progressOverride.key]: Math.max(0, Math.min(100, debugOv.progressOverride.value))
    };
  }
  if (debugOv.forceGameOver) {
    resolution.newIsGameOver = true;
    resolution.newHp = 0;
    resolution.newLives = 0;
  }
  console.log('[DEBUG] Overrides applied:', debugOv);
}

/**
 * 注入导演系统、掉头返程、好感度检定的叙事覆盖
 */
export function applyNarrativeOverrides(
  resolution: PipelineResult,
  state: GameState,
  directorResult: DirectorResult,
  isRetreatIntent: boolean,
): void {
  // 导演系统叙事覆盖
  if (directorResult.narrativeOverride) {
    resolution.narrativeInstruction = directorResult.narrativeOverride;
  }

  // 掉头返程叙事注入
  if (isRetreatIntent && state.transitState) {
    const origFromNode = state.worldData?.nodes.find(n => n.id === state.transitState!.fromNodeId);
    const returnToName = origFromNode?.name || state.transitState.fromNodeId || '来时的方向';
    resolution.narrativeInstruction = `【系统强制 - 掉头返程】：玩家决定中途折返，掉头返回【${returnToName}】方向！路程进度已反转（当前返程进度${resolution.newTransitState?.pathProgress ?? 0}%）。请尊重玩家的返程决定，描写掉头折返的过程。\n` + resolution.narrativeInstruction;
  }

  // 好感度检定叙事注入
  if (resolution.affectionTriggered === 'aid') {
    resolution.narrativeInstruction += `\n【好感度援助】：同伴因与玩家关系亲密（好感度${state.affection}），在关键时刻出手相助！请结合同伴的【特长: ${state.companionProfile.specialties}】描写一段精彩的援助行动，使局面好转。`;
  } else if (resolution.affectionTriggered === 'sabotage') {
    resolution.narrativeInstruction += `\n【好感度冷淡】：同伴因与玩家关系冷淡（好感度${state.affection}），在危急关头袖手旁观甚至落井下石！请结合同伴的性格描写冷漠、嘲讽或使绊子的反应，使局面雪上加霜。`;
  }
}

/**
 * 将 resolution 结果写入 GameState（构建 updateState 回调所需的 partial）
 * additionalRevealHouseIds: 本回合需要额外揭盲的建筑（如任务目标）
 */
export function buildStateUpdate(
  resolution: PipelineResult,
  additionalRevealHouseIds?: string[],
): (prev: GameState) => Partial<GameState> {
  return (prev: GameState) => {
    const worldData = prev.worldData
      ? applyProgressAndReveals(
          prev.worldData,
          resolution.newProgressMap,
          resolution.houseSafetyUpdate,
          additionalRevealHouseIds,
        )
      : prev.worldData;

    return {
      hp: resolution.newHp,
      lives: resolution.newLives,
      isGameOver: resolution.newIsGameOver,
      inventory: resolution.newInventory,
      currentNodeId: resolution.newNodeId,
      currentHouseId: resolution.newHouseId,
      transitState: resolution.newTransitState,
      worldData,
      pacingState: {
        tensionLevel: resolution.newTensionLevel,
        turnsInCurrentLevel: resolution.tensionChanged ? 1 : (prev.pacingState.turnsInCurrentLevel + 1)
      }
    };
  };
}

/**
 * 应用 Debug 覆写中的直写字段（任务/好感度）
 */
export function applyDebugDirectWrites(
  debugOv: DebugOverrides,
  updateState: (u: Partial<GameState>) => void,
): void {
  if (debugOv.forceQuest) updateState({ currentObjective: debugOv.forceQuest });
  if (debugOv.clearQuest) updateState({ currentObjective: null });
  if (debugOv.affection !== undefined) updateState({ affection: Math.max(0, Math.min(100, debugOv.affection)) });
}
