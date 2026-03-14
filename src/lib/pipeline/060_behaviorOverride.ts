/**
 * Step ③ 行为覆写
 *
 * 职责：
 * - idle/suicidal_idle 在高紧张度时已通过 tensionConfig 的 probabilities=[1,0,0] 强制大失败
 * - 这里处理额外的行为覆写规则（如有）
 * - Zone 探索度 100% 且在野外时，T1 explore 大失败改为普通（屏蔽伏击升级）
 *
 * 当前此步骤主要处理 isNodeFullyExplored 的大失败屏蔽
 */

import type { PipelineContext } from './types';

export function stepBehaviorOverride(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;

  // 区域探索度 100% + 野外 + T1 explore 大失败 → 降级为普通
  // 原因：该区域所有威胁已被探明，不再触发随机伏击
  if (tension === 1 && intent.intent === 'explore' && ctx.tier === 0) {
    const nodeKey = state.currentNodeId ? `node_${state.currentNodeId}` : '';
    const nodeProgress = nodeKey ? (ctx.newProgressMap[nodeKey] || 0) : 0;
    const isOutdoors = !state.currentHouseId;
    if (nodeProgress >= 100 && isOutdoors) {
      ctx.tier = 1; // 大失败 → 普通
      ctx.formulaBreakdown += '\n[行为覆写] 区域已完全探索，大失败降级为普通';
    }
  }
}
