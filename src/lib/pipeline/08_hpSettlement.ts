/**
 * Step ⑧ HP 结算
 *
 * 职责：
 * - 根据 tier + tensionConfig.hpDelta 计算 HP 增减
 * - 安全区内自动回血 +5
 * - 赶路中的 HP 按紧张度分级计算
 * - T3 move 特殊：失败时慌不择路额外扣血
 */

import type { PipelineContext } from './types';
import { TENSION_ROUTE } from '../tensionConfig';

export function stepHpSettlement(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;
  const action = intent.intent;

  // ── 安全区回血 ──
  if (ctx.isInSafeZone && !state.transitState) {
    ctx.newHp = Math.min(100, state.hp + 5);
    // 安全区内不扣血，直接返回
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
      ctx.newHp = Math.max(0, state.hp + failHpDelta);
    }
    // 普通/大成功不扣血
    return;
  }

  // ── T3 move 慌不择路特殊扣血 ──
  if (tension === 3 && action === 'move') {
    if (state.currentHouseId) {
      // 在建筑内冲出：走 tensionConfig
      const route = TENSION_ROUTE[3]?.['move'];
      if (route) {
        ctx.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[ctx.tier]));
      }
    } else if (!ctx.moveSucceeded && ctx.moveTarget?.type !== 'cross-node'
      && ctx.moveTarget?.type !== 'enter-house' && ctx.moveTarget?.type !== 'exit-to-house') {
      // 慌不择路 → 额外 -20
      ctx.newHp = Math.max(0, state.hp - 20);
    } else {
      // 走 tensionConfig
      const route = TENSION_ROUTE[3]?.['move'];
      if (route) {
        ctx.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[ctx.tier]));
      }
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

  ctx.newHp = Math.max(0, Math.min(100, state.hp + route.hpDelta[ctx.tier]));
}
