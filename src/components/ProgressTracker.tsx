import { GameState } from '../types/game';

interface ProgressTrackerProps {
  state: GameState;
}

export function ProgressTracker({ state }: ProgressTrackerProps) {
  let label = '';
  let progress = 0;
  let barColor = '';
  let glowColor = '';

  if (state.transitState) {
    label = '旅途进度';
    progress = state.transitState.pathProgress;
    barColor = 'bg-amber-500';
    glowColor = 'shadow-amber-500/50';
  } else if (state.currentHouseId && state.worldData) {
    const house = state.worldData.nodes.flatMap(n => n.houses).find(h => h.id === state.currentHouseId);
    progress = house?.progress || 0;
    label = '室内搜刮';
    barColor = 'bg-cyan-400';
    glowColor = 'shadow-cyan-400/50';
  } else if (state.currentNodeId && state.worldData) {
    const node = state.worldData.nodes.find(n => n.id === state.currentNodeId);
    progress = node?.progress || 0;
    label = '区域探索';
    barColor = 'bg-emerald-400';
    glowColor = 'shadow-emerald-400/50';
  }

  if (!label) return null;

  const clampedProgress = Math.min(100, Math.round(progress));

  return (
    <div className="px-4 py-1.5 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <span className="text-[11px] text-zinc-400 shrink-0 font-medium tracking-wide uppercase">
          {label}
        </span>
        <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} rounded-full transition-all duration-700 ease-out shadow-sm ${glowColor}`}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <span className={`text-[11px] shrink-0 tabular-nums font-mono ${
          clampedProgress >= 100 ? 'text-emerald-400' : 'text-zinc-400'
        }`}>
          {clampedProgress}%
        </span>
      </div>
    </div>
  );
}
