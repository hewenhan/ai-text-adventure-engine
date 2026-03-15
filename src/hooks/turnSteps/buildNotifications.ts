/**
 * 构建本回合待显示的通知列表（抵达/揭盲/发现建筑）
 *
 * 揭盲判定：比较 worldData 中 house.revealed（回合前快照）与
 * applyProgressAndReveals 后的新 revealed 状态，差集即为新揭盲建筑。
 */

import { applyProgressAndReveals } from '../../lib/pipeline';
import type { GameState } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import type { GrandNotificationData } from '../../components/GrandNotification';
import type { DirectorResult } from './directorSystem';

export function buildNotifications(
  state: GameState,
  resolution: PipelineResult,
  directorResult: DirectorResult,
): Omit<GrandNotificationData, 'id'>[] {
  const notifications: Omit<GrandNotificationData, 'id'>[] = [];

  // 抵达新节点
  if (!resolution.newTransitState && state.transitState && resolution.newNodeId !== state.currentNodeId) {
    const arrivedNode = state.worldData?.nodes.find(n => n.id === resolution.newNodeId);
    if (arrivedNode) {
      notifications.push({
        type: 'discovery',
        title: '抵达地点！',
        description: `你抵达了【${arrivedNode.name}】`,
      });
    }
  }

  // 任务目标地点揭盲
  if (state.currentObjective && resolution.newNodeId === state.currentObjective.targetNodeId
    && resolution.newNodeId !== state.currentNodeId) {
    notifications.push({
      type: 'discovery',
      title: '目标地点已揭盲！',
      description: `任务目标所在区域已进入视野`,
    });
  }

  // 探索进度 / 任务揭盲的建筑通知
  // 用 applyProgressAndReveals 模拟新状态，与旧 worldData 比较 revealed 差集
  if (state.worldData && !resolution.newTransitState) {
    const questRevealIds = directorResult.newObjective?.targetHouseId
      ? [directorResult.newObjective.targetHouseId]
      : undefined;
    const updatedWorldData = applyProgressAndReveals(
      state.worldData,
      resolution.newProgressMap,
      resolution.houseSafetyUpdate,
      questRevealIds,
    );

    const revealNode = updatedWorldData.nodes.find(n => n.id === resolution.newNodeId);
    const oldNode = state.worldData.nodes.find(n => n.id === resolution.newNodeId);
    if (revealNode && oldNode) {
      const oldRevealedIds = new Set(oldNode.houses.filter(h => h.revealed).map(h => h.id));
      for (const house of revealNode.houses) {
        if (house.revealed && !oldRevealedIds.has(house.id)) {
          notifications.push({
            type: 'discovery',
            title: '发现新建筑！',
            description: `在【${revealNode.name}】发现了【${house.name}】`,
          });
        }
      }
    }
  }

  // 合并导演系统的任务通知（quest + discovery）
  if (directorResult.questNotification) {
    notifications.unshift(directorResult.questNotification);
    if (directorResult.questDiscoveryNotification) {
      notifications.splice(1, 0, directorResult.questDiscoveryNotification);
    }
  }

  return notifications;
}
