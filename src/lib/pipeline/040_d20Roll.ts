/**
 * Step ② D20 判定 + 好感度修正
 *
 * 职责：
 * - 掷 D20 骰子
 * - 根据好感度计算修正值（T≥2 时触发）
 * - 根据当前紧张度和行为类型查表得到概率分布
 * - 将 effectiveRoll 映射到 tier (0=大失败, 1=普通, 2=大成功)
 */

import type { PipelineContext, RollTier } from './types';
import { TENSION_ROUTE, type RouteDef } from '../tensionConfig';

/**
 * 根据概率分布和 roll 值计算档位
 * probabilities: [大失败概率, 普通概率, 大成功概率]
 */
export function rollToTier(probabilities: [number, number, number], roll: number): RollTier {
  const thresh1 = Math.round(20 * probabilities[0]);
  const thresh2 = Math.round(20 * (probabilities[0] + probabilities[1]));
  if (roll <= thresh1) return 0;
  if (roll <= thresh2) return 1;
  return 2;
}

/**
 * 好感度概率检定
 * 帮助概率 = 0.75×(affection - 60) / 100
 * 范围 [-45%, +30%]，以 60 好感为中值
 * 返回 roll 修正值 (+3 援助 / -3 落井下石 / 0 无触发)
 */
function applyAffectionModifier(
  affection: number, tension: number, roll: number
): { adjustedRoll: number; triggered: 'aid' | 'sabotage' | null; detail: string } {
  // 只在 tension ≥ 2（冲突及以上）时触发
  if (tension < 2) {
    return { adjustedRoll: roll, triggered: null, detail: `好感度修正: 跳过(tension=${tension}<2)` };
  }

  const helpProb = (0.75 * (affection - 60)) / 100;
  const diceRoll = Math.random();
  const probStr = `P=0.75×(${affection}-60)/100=${helpProb.toFixed(2)}`;
  const diceStr = `随机=${diceRoll.toFixed(3)}`;

  if (helpProb > 0 && diceRoll < helpProb) {
    const adjusted = Math.min(20, roll + 3);
    return { adjustedRoll: adjusted, triggered: 'aid', detail: `好感度修正: ${probStr}, ${diceStr}<${helpProb.toFixed(2)} → 援助! D20(${roll})+3=${adjusted}` };
  } else if (helpProb < 0 && diceRoll < Math.abs(helpProb)) {
    const adjusted = Math.max(1, roll - 3);
    return { adjustedRoll: adjusted, triggered: 'sabotage', detail: `好感度修正: ${probStr}, ${diceStr}<|${helpProb.toFixed(2)}|=${Math.abs(helpProb).toFixed(2)} → 落井下石! D20(${roll})-3=${adjusted}` };
  }

  return { adjustedRoll: roll, triggered: null, detail: `好感度修正: ${probStr}, ${diceStr} 未触发(阈值${Math.abs(helpProb).toFixed(2)}), Roll不变=${roll}` };
}

/**
 * 获取当前紧张度和行为对应的路由配置
 * 优先匹配动作名，兜底 default
 */
function getRoute(tension: number, action: string): RouteDef | null {
  const table = TENSION_ROUTE[tension];
  if (!table) return null;
  return table[action] || table['default'] || null;
}

export function stepD20Roll(ctx: PipelineContext): void {
  const { state } = ctx;
  const tension = state.pacingState.tensionLevel;
  const action = ctx.intent.intent;

  // ── 武器 buff：找最强武器 ──
  const bestWeapon = state.inventory
    .filter(i => i.type === 'weapon' && i.buff)
    .sort((a, b) => (b.buff ?? 0) - (a.buff ?? 0))[0] ?? null;
  ctx.weaponBuff = bestWeapon?.buff ?? 0;

  // ── 防具 buff：找最强防具（提前写入 ctx 供 HP 结算用） ──
  const bestArmor = state.inventory
    .filter(i => i.type === 'armor' && i.buff)
    .sort((a, b) => (b.buff ?? 0) - (a.buff ?? 0))[0] ?? null;
  ctx.armorReduction = bestArmor?.buff ?? 0;

  // ── 好感度修正 ──
  const { adjustedRoll, triggered, detail } = applyAffectionModifier(
    state.affection, tension, ctx.rawRoll
  );
  ctx.effectiveRoll = adjustedRoll;
  ctx.affectionTriggered = triggered;

  // ── 武器修正（T≥2 combat/explore 时，weapon buff 转化为 roll 加值） ──
  let weaponDetail = '';
  if (ctx.weaponBuff > 0 && tension >= 2 && (action === 'combat' || action === 'explore')) {
    // buff 是 20-80 的百分比，转化为 D20 加值：buff/100 * 5 → 1~4 点
    const rollBonus = Math.max(1, Math.round(ctx.weaponBuff / 100 * 5));
    ctx.effectiveRoll = Math.min(20, ctx.effectiveRoll + rollBonus);
    weaponDetail = ` | 武器[${bestWeapon!.name}]buff=${ctx.weaponBuff}% → +${rollBonus}→${ctx.effectiveRoll}`;
  }

  // ── 查表获取概率 → 计算 tier ──
  // 赶路中使用特殊概率（不走 tensionConfig 的表）
  if (state.transitState) {
    let transitProbs: [number, number, number];
    if (tension >= 4)      transitProbs = [0.50, 0.40, 0.10];
    else if (tension >= 3) transitProbs = [0.30, 0.60, 0.10];
    else if (tension >= 2) transitProbs = [0.15, 0.65, 0.20];
    else                   transitProbs = [0.08, 0.72, 0.20];

    ctx.tier = rollToTier(transitProbs, ctx.effectiveRoll);
    const tierLabel = ['大失败', '普通', '大成功'][ctx.tier];
    ctx.formulaBreakdown = `原始D20=${ctx.rawRoll} | ${detail}${weaponDetail} | 有效Roll=${ctx.effectiveRoll}\n赶路概率[${transitProbs}] → T${ctx.tier} ${tierLabel}`;
    return;
  }

  // 安全区探索使用特殊概率
  const isInSafeZone = ctx.isInSafeZone; // 由 step ⑥ 还没跑... 但其实这里需要提前判断
  // 注意：safe zone 的判定在这一步需要提前做一个初步判定
  // 因为 safe zone 的概率和普通区域不同
  const currentNode = state.worldData?.nodes.find(n => n.id === state.currentNodeId);
  const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);
  const inSafeHouse = currentHouse && currentHouse.safetyLevel === 'safe';
  const inSafeNode = currentNode && currentNode.safetyLevel === 'safe';
  const isSafe = !!(inSafeHouse || inSafeNode);

  if (isSafe && action === 'explore') {
    const safeProbs: [number, number, number] = [0, 0.7, 0.3];
    ctx.tier = rollToTier(safeProbs, ctx.effectiveRoll);
    const tierLabel = ['大失败', '普通', '大成功'][ctx.tier];
    ctx.formulaBreakdown = `原始D20=${ctx.rawRoll} | ${detail}${weaponDetail} | 有效Roll=${ctx.effectiveRoll}\n安全区探索[${safeProbs}] → T${ctx.tier} ${tierLabel}`;
    return;
  }

  // 普通情况：查 tensionConfig 表
  const route = getRoute(tension, action);
  if (route) {
    ctx.tier = rollToTier(route.probabilities, ctx.effectiveRoll);
  } else {
    ctx.tier = 1; // 兜底：普通
  }

  const tierLabel = ['大失败', '普通', '大成功'][ctx.tier];
  const routeProbs = route ? route.probabilities : [0, 1, 0];
  ctx.formulaBreakdown = `原始D20=${ctx.rawRoll} | ${detail}${weaponDetail} | 有效Roll=${ctx.effectiveRoll}\nT${tension}.${action}[${routeProbs}] → T${ctx.tier} ${tierLabel}`;
}
