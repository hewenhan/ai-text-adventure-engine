/**
 * Step ⑤ 紧张度升降
 *
 * 职责：
 * - 根据 tier（D20结果档位）查 tensionConfig 获取 tensionDelta
 * - 应用基本的紧张度升降（不考虑安全区和里程碑覆写）
 * - 特殊处理：T0 move 离开时强升 T1
 */

import type { PipelineContext } from './types';
import { TENSION_ROUTE } from '../tensionConfig';
import { clampTension } from './helpers';

export function stepTensionDelta(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;
  const action = intent.intent;

  // ── 赶路中的紧张度变化 ──
  if (state.transitState) {
    if (tension >= 2) {
      // 高紧张度赶路：大失败升、大成功降
      let tensionOnFail: number, tensionOnCrit: number;
      if (tension >= 4) { tensionOnFail = 0; tensionOnCrit = -2; }
      else if (tension >= 3) { tensionOnFail = 1; tensionOnCrit = -1; }
      else { tensionOnFail = 1; tensionOnCrit = -1; }

      const delta = ctx.tier === 0 ? tensionOnFail : (ctx.tier === 2 ? tensionOnCrit : 0);
      ctx.newTensionLevel = clampTension(tension + delta);
    }
    // 和平赶路（T0-1）：紧张度不变

    // 赶路抵达终点时：根据目的地安全度设定（在 step ⑥ 处理）
    return;
  }

  // ── T0 move 离开安全区 → 强制 T1 ──
  if (tension === 0 && action === 'move' && ctx.moveSucceeded) {
    ctx.newTensionLevel = 1;
    return;
  }

  // ── 查表获取 tensionDelta ──
  const table = TENSION_ROUTE[tension];
  if (!table) return;

  // 确定查表用的 action key
  let routeKey: string = action;
  if (action === 'seek_quest') routeKey = 'default';
  // T2/T3/T4 的 explore 按 combat 查（已在 config 中统一）

  const route = table[routeKey] || table['default'];
  if (!route) return;

  const delta = route.tensionDelta[ctx.tier];
  ctx.newTensionLevel = clampTension(tension + delta);
}
