/**
 * Step ⑥½ BOSS 检测
 *
 * 职责：
 * - 检测当前位置（step ④ 确定后）是否存在持久 BOSS
 * - 存在 BOSS → 强制拉高紧张度到 BOSS 等级
 * - 检测 BOSS 是否在本回合被击败（combat 大成功导致紧张度骤降）
 *   → 清除 BOSS 标记、位置变为 safe
 * - BOSS 击败判定必须在 safeZoneOverride 之后、milestone 之前
 *   以免新 milestone 覆盖刚被清除的状态
 *
 * 放置于 120_safeZoneOverride 之后、140_milestone 之前执行
 */

import type { PipelineContext } from './types';
import { findNode, findHouse } from './helpers';

export function stepBossCheck(ctx: PipelineContext): void {
  const { state, intent } = ctx;

  // 赶路中不触发 BOSS 检查
  if (ctx.newTransitState || state.transitState) return;

  const node = findNode(state, ctx.newNodeId);
  if (!node) return;

  // ── 确定当前位置是否有 BOSS ──
  let boss: { tensionLevel: 2 | 3 | 4 } | null = null;
  let bossLocationKey: string | null = null;

  if (ctx.newHouseId) {
    const house = findHouse(node, ctx.newHouseId);
    if (house?.activeBoss) {
      boss = house.activeBoss;
      bossLocationKey = `house_${house.id}`;
    }
  } else if (node.activeBoss) {
    boss = node.activeBoss;
    bossLocationKey = `node_${node.id}`;
  }

  if (!boss || !bossLocationKey) {
    ctx.inBossZone = false;
    return;
  }

  ctx.inBossZone = true;

  // ── 检测 BOSS 击败：combat 大成功导致紧张度降至 BOSS 等级以下 ──
  const wasCombat = intent.intent === 'combat';
  const wasCrit = ctx.tier === 2;
  const tensionDropped = ctx.newTensionLevel < boss.tensionLevel;

  if (wasCombat && wasCrit && tensionDropped) {
    // BOSS 被击败！必出装备掉落
    ctx.bossDefeatedKey = bossLocationKey;
    ctx.inBossZone = false;
    ctx.guaranteedDrop = 'boss';

    // 将位置标记为 safe
    if (ctx.newHouseId) {
      ctx.houseSafetyUpdate = { houseId: ctx.newHouseId, newSafetyLevel: 'safe' };
    }
    // node BOSS 击败 → node 也变 safe（由 applyProgressAndReveals 处理）

    // 紧张度降到 0（胜利庆祝）
    ctx.newTensionLevel = 0;
    ctx.isInSafeZone = true;
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;

    const locationName = ctx.newHouseId
      ? (findHouse(node, ctx.newHouseId)?.name || ctx.newHouseId)
      : node.name;
    ctx.narrativeInstruction = `【系统强制 - BOSS 击败】：${locationName} 的首领被彻底击败！该区域威胁已被肃清，变为安全地带。主角可以安心休整。\n`;
    return;
  }

  // ── BOSS 仍然存活：强制紧张度到 BOSS 等级 ──
  if (ctx.newTensionLevel < boss.tensionLevel) {
    ctx.newTensionLevel = boss.tensionLevel;
  }
  ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
  ctx.isInSafeZone = false;

  // 如果玩家刚进入 BOSS 区域（上一回合不在这里），添加警告叙事
  const wasHere = ctx.newHouseId
    ? state.currentHouseId === ctx.newHouseId
    : state.currentNodeId === ctx.newNodeId && !state.currentHouseId;

  if (!wasHere) {
    const locationName = ctx.newHouseId
      ? (findHouse(node, ctx.newHouseId)?.name || ctx.newHouseId)
      : node.name;
    ctx.narrativeInstruction = `【系统强制 - BOSS 遭遇】：踏入 ${locationName} 的瞬间，潜伏的首领现身！紧张度强制升至 ${boss.tensionLevel} 级，必须战斗或设法逃离！\n`;
  }
}
