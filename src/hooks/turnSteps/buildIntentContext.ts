/**
 * Step 1: 组装意图提取所需的上下文信息
 */

import { findNode, getVisibleHouses, buildVisionContext } from '../../lib/pipeline';
import type { GameState, IntentResult } from '../../types/game';

export interface IntentContext {
  connectedNodesInfo: string;
  visibleHousesInfo: string;
  recentConversation: string;
  lastIntent: string | null;
  transitInfo: { fromName: string; toName: string; progress: number } | null;
  visionContext: string;
}

export function buildIntentContext(state: GameState): IntentContext {
  const currentNode = findNode(state, state.currentNodeId)!;
  const visionContext = buildVisionContext(state);

  // 组装带名称和类型的连接节点信息
  const connectedNodesInfo = currentNode.connections.map(connId => {
    const connNode = state.worldData!.nodes.find(n => n.id === connId);
    return connNode ? `${connId} (${connNode.name} - ${connNode.type})` : connId;
  }).join(', ');

  // 组装已揭盲建筑信息
  const visibleHousesList = getVisibleHouses(currentNode);
  const visibleHousesInfo = visibleHousesList.length > 0
    ? visibleHousesList.map(h => `${h.id} (${h.name} - ${h.type})`).join(', ')
    : 'None';

  // 提取最近两轮对话上下文用于意图判定
  const recentTurns: string[] = [];
  let turnCount = 0;
  for (let i = state.history.length - 1; i >= 0 && turnCount < 2; i--) {
    recentTurns.unshift(`${state.history[i].role}: ${state.history[i].text}`);
    if (state.history[i].role === 'user') turnCount++;
  }
  const recentConversation = recentTurns.join('\n');

  // 提取上一次意图用于求生本能法则
  const lastModelMsg = [...state.history].reverse().find(m => m.debugState?.lastIntent);
  const lastIntent = lastModelMsg?.debugState?.lastIntent || null;

  // 组装旅途信息供意图判断使用
  const transitInfo = state.transitState ? (() => {
    const fromNode = state.worldData!.nodes.find(n => n.id === state.transitState!.fromNodeId);
    const toNode = state.worldData!.nodes.find(n => n.id === state.transitState!.toNodeId);
    return {
      fromName: fromNode?.name || state.transitState!.fromNodeId,
      toName: toNode?.name || state.transitState!.toNodeId,
      progress: state.transitState!.pathProgress,
    };
  })() : null;

  return { connectedNodesInfo, visibleHousesInfo, recentConversation, lastIntent, transitInfo, visionContext };
}
