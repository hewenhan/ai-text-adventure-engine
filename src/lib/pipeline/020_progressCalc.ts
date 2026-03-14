/**
 * Step ① 探索/赶路进度计算
 *
 * 职责：
 * - 计算本轮活跃的进度键（node_* / house_* / transit）
 * - 判断进度熔断（已 100% 不允许继续 explore）
 * - 注意：实际的进度增量在 D20 判定后才能确定，这里只做预检
 *   真正的进度增量将在 step ⑤ tensionDelta 之后、由各步骤按需写入
 */

import type { PipelineContext } from './types';

export function stepProgressCalc(ctx: PipelineContext): void {
  const { state, intent } = ctx;

  // 确定本轮活跃的进度键
  if (state.transitState) {
    ctx.activeProgressKey = 'transit';
  } else if (state.currentHouseId) {
    ctx.activeProgressKey = `house_${state.currentHouseId}`;
  } else if (state.currentNodeId) {
    ctx.activeProgressKey = `node_${state.currentNodeId}`;
  } else {
    ctx.activeProgressKey = '';
  }

  // 进度熔断检查：当前区域已探索 100% 时，explore 被封锁
  if (intent.intent === 'explore' && ctx.activeProgressKey && ctx.activeProgressKey !== 'transit') {
    const currentProgress = ctx.newProgressMap[ctx.activeProgressKey] || 0;
    if (currentProgress >= 100) {
      ctx.progressCapped = true;
    }
  }
}
