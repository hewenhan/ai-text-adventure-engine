/**
 * Step ⑧ HP 结算
 *
 * 职责：
 * - 根据 tier + tensionConfig.hpDelta 计算 HP 增减
 * - 安全区内自动回血 +5
 * - 赶路中的 HP 按紧张度分级计算
 * - 防具减伤：ctx.armorReduction（由 D20 step 计算的最强防具 buff%）
 * - 退敌道具：use_item 意图 + escape 类型道具 → 免罚
 */

import type { PipelineContext } from './types';
import { TENSION_ROUTE } from '../tensionConfig';

/** 应用防具减伤 */
function applyArmor(rawDelta: number, armorReduction: number): number {
  if (rawDelta >= 0 || armorReduction <= 0) return rawDelta;
  // 减伤百分比应用于负值伤害
  return Math.round(rawDelta * (1 - armorReduction / 100));
}

export function stepHpSettlement(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;
  const action = intent.intent;

  // ── 退敌道具检测：use_item + escape 类型 → 本回合免伤 ──
  if (action === 'use_item' && intent.itemName) {
    const escapeItem = state.inventory.find(
      i => i.type === 'escape' && i.name === intent.itemName
    );
    if (escapeItem && tension >= 2) {
      ctx.escapeItemUsed = escapeItem;
      // 消耗道具
      ctx.newInventory = ctx.newInventory.filter(i => i.id !== escapeItem.id);
      // 免伤 + T→1
      ctx.newTensionLevel = Math.min(ctx.newTensionLevel, 1) as 0 | 1 | 2 | 3 | 4;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.narrativeInstruction = `【系统强制 - 退敌道具】：玩家使用了【${escapeItem.name}】成功脱离危险！紧张度降至安全水平。\n` + ctx.narrativeInstruction;
      // 不扣血
      return;
    }
  }

  // ── 安全区回血 ──
  if (ctx.isInSafeZone && !state.transitState) {
    ctx.newHp = Math.min(100, state.hp + 5);
    return;
  }

  // ── 赶路中的 HP ──
  if (state.transitState) {
    let failHpDelta: number;
    if (tension >= 4) failHpDelta = -25;
    else if (tension >= 3) failHpDelta = -15;
    else if (tension >= 2) failHpDelta = -5;
    else failHpDelta = 0;

    if (ctx.tier === 0 && failHpDelta < 0) {
      ctx.newHp = Math.max(0, state.hp + applyArmor(failHpDelta, ctx.armorReduction));
    }
    return;
  }

  // ── 通用查表 ──
  const table = TENSION_ROUTE[tension];
  if (!table) return;

  let routeKey: string = action;
  if (action === 'seek_quest') routeKey = 'default';
  const route = table[routeKey] || table['default'];
  if (!route) return;

  const rawDelta = route.hpDelta[ctx.tier];
  const finalDelta = applyArmor(rawDelta, ctx.armorReduction);
  ctx.newHp = Math.max(0, Math.min(100, state.hp + finalDelta));
}
