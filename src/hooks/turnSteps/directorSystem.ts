/**
 * Step 1.5b: 导演系统 — seek_quest 任务派发与叙事覆盖
 * Phase 4: 支持 3-5 环任务链系统
 */

import type { GameState, IntentResult, QuestStage } from '../../types/game';
import type { GrandNotificationData } from '../../components/GrandNotification';

export interface DirectorResult {
  narrativeOverride: string | null;
  questNotification: Omit<GrandNotificationData, 'id'> | null;
  questDiscoveryNotification: Omit<GrandNotificationData, 'id'> | null;
  /** 如果导演分支 B 派发了新任务，存在此字段 */
  newObjective: { targetNodeId: string; targetHouseId: string; targetLocationName: string; description: string } | null;
  /** 需要异步生成任务链（useChatLogic 消费） */
  needsQuestChainGeneration: boolean;
}

/**
 * 检查是否应自动升级为 seek_quest（idle + T0 + 无目标 + 闲聊 ≥3 回合）
 */
export function maybeEscalateToSeekQuest(intent: IntentResult, state: GameState): void {
  if (intent.intent === 'idle' && state.pacingState.tensionLevel === 0
    && !state.currentObjective && !state.questChain && state.pacingState.turnsInCurrentLevel >= 3) {
    intent.intent = 'seek_quest';
  }
}

/**
 * 推进任务链到下一环节，返回下一环的 objective
 */
export function advanceQuestChain(state: GameState): {
  nextObjective: { targetNodeId: string; targetHouseId: string; targetLocationName: string; description: string } | null;
  questCompleted: boolean;
} {
  const chain = state.questChain;
  if (!chain || chain.length === 0) return { nextObjective: null, questCompleted: false };

  const nextIdx = state.currentQuestStageIndex + 1;
  if (nextIdx >= chain.length) {
    // 任务链全部完成
    return { nextObjective: null, questCompleted: true };
  }

  const nextStage = chain[nextIdx];
  return {
    nextObjective: {
      targetNodeId: nextStage.targetNodeId,
      targetHouseId: nextStage.targetHouseId,
      targetLocationName: nextStage.targetLocationName,
      description: nextStage.description,
    },
    questCompleted: false,
  };
}

/**
 * 执行导演系统逻辑，返回叙事覆盖和通知
 */
export function runDirector(intent: IntentResult, state: GameState): DirectorResult {
  const result: DirectorResult = {
    narrativeOverride: null,
    questNotification: null,
    questDiscoveryNotification: null,
    newObjective: null,
    needsQuestChainGeneration: false,
  };

  if (intent.intent !== 'seek_quest') return result;

  if (state.currentObjective !== null) {
    // 分支 A：玩家已有目标却在瞎折腾
    result.narrativeOverride = `【系统强制】：玩家当前已有明确主线任务（${state.currentObjective.description}），却漫无目的或提出去别的无关地点。请伴游 NPC 立刻严厉打断玩家，提醒玩家不要节外生枝，赶紧打开地图寻找前往目标的路线！`;
  } else {
    // 分支 B：玩家确实没有目标 → 触发任务链生成
    // 标记需要异步生成任务链，由 useChatLogic 消费
    result.needsQuestChainGeneration = true;
    result.narrativeOverride = `【系统强制】：玩家目前漫无目的。请伴游 NPC 暗示接下来将会有紧急任务，表现出若有所思的样子，仿佛想起了什么重要的事情。`;
  }

  return result;
}
