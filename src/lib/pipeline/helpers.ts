/**
 * 管线公共工具函数
 * 空间查询、节点/建筑查找、可见性计算等
 */

import type { GameState, NodeData, HouseData, WorldData, SafetyLevel } from '../../types/game';

/** 根据 nodeId 查找节点数据 */
export function findNode(state: GameState, nodeId: string | null): NodeData | undefined {
  if (!nodeId || !state.worldData) return undefined;
  return state.worldData.nodes.find(n => n.id === nodeId);
}

/** 在节点中查找建筑数据 */
export function findHouse(node: NodeData | undefined, houseId: string | null): HouseData | undefined {
  if (!node || !houseId) return undefined;
  return node.houses.find(h => h.id === houseId);
}

/**
 * 获取当前节点中已揭盲（可见）的建筑列表
 * 直接读取 house.revealed 持久标记
 */
export function getVisibleHouses(node: NodeData): HouseData[] {
  return node.houses.filter(h => h.revealed);
}

/**
 * 从 worldData 中提取扁平进度表，供管线内部使用
 */
export function extractProgressMap(worldData: WorldData): Record<string, number> {
  const map: Record<string, number> = {};
  for (const node of worldData.nodes) {
    if (node.progress) map[`node_${node.id}`] = node.progress;
    for (const house of node.houses) {
      if (house.progress) map[`house_${house.id}`] = house.progress;
    }
  }
  return map;
}

/**
 * 将管线输出的扁平进度表 + 安全等级变更 回写到 worldData
 * 同时根据进度阈值自动更新 house.revealed
 */
export function applyProgressAndReveals(
  worldData: WorldData,
  newProgressMap: Record<string, number>,
  houseSafetyUpdate: { houseId: string; newSafetyLevel: SafetyLevel } | null,
  additionalRevealHouseIds?: string[],
): WorldData {
  return {
    ...worldData,
    nodes: worldData.nodes.map(n => {
      const nodeProgress = newProgressMap[`node_${n.id}`] ?? n.progress;
      return {
        ...n,
        progress: nodeProgress,
        houses: n.houses.map((h, index) => {
          const houseProgress = newProgressMap[`house_${h.id}`] ?? h.progress;
          const revealedByProgress = nodeProgress >= (index + 1) * 30;
          const revealedByExtra = additionalRevealHouseIds?.includes(h.id);
          return {
            ...h,
            progress: houseProgress,
            revealed: h.revealed || revealedByProgress || !!revealedByExtra,
            safetyLevel: houseSafetyUpdate?.houseId === h.id
              ? houseSafetyUpdate.newSafetyLevel
              : h.safetyLevel,
          };
        }),
      };
    }),
  };
}

/** 构建当前视野描述文本（用于 AI prompt） */
export function buildVisionContext(state: GameState): string {
  const currentNode = findNode(state, state.currentNodeId);
  if (!currentNode) return '未知区域';

  const visibleHouses = getVisibleHouses(currentNode);
  const houseStr = visibleHouses.length > 0
    ? visibleHouses.map(h => `${h.name}(${h.type})`).join(', ')
    : '尚未发现可互动的建筑';

  const currentHouse = findHouse(currentNode, state.currentHouseId);
  const locationStr = currentHouse
    ? `当前位于: ${currentNode.name} → ${currentHouse.name}`
    : `当前位于: ${currentNode.name}(野外街区)`;

  return `${locationStr}. 已揭盲可互动的微观建筑: ${houseStr}`;
}

/** 紧张度钳位到 0-4 */
export function clampTension(val: number): 0 | 1 | 2 | 3 | 4 {
  return Math.max(0, Math.min(4, Math.round(val))) as 0 | 1 | 2 | 3 | 4;
}

/** HP 描述文本 */
export function getHpDescription(hp: number, language: 'zh' | 'en'): string {
  if (language === 'zh') {
    if (hp >= 80) return '健康无伤';
    if (hp >= 50) return '轻微擦伤';
    if (hp >= 30) return '受伤流血';
    return '重伤咳血，濒临倒下';
  }
  if (hp >= 80) return 'Healthy, no injuries';
  if (hp >= 50) return 'Minor scratches';
  if (hp >= 30) return 'Wounded, bleeding';
  return 'Critically wounded, on the verge of collapse';
}
