import { GameState } from '../types/game';
import { AnimatePresence, motion } from 'motion/react';

interface ProgressTrackerProps {
  state: GameState;
}

export function ProgressTracker({ state }: ProgressTrackerProps) {
  let label = '';
  let progress = 0;
  let barColor = '';
  let glowColor = '';
  let locationName = '';

  if (state.transitState) {
    label = '旅途进度';
    progress = state.transitState.pathProgress;
    barColor = 'bg-amber-500';
    glowColor = 'shadow-amber-500/50';
    const toNode = state.worldData?.nodes.find(n => n.id === state.transitState!.toNodeId);
    locationName = toNode ? `→ ${toNode.name}` : '';
  } else if (state.currentHouseId && state.worldData) {
    const node = state.worldData.nodes.find(n => n.id === state.currentNodeId);
    const house = node?.houses.find(h => h.id === state.currentHouseId);
    progress = house?.progress || 0;
    label = '室内搜刮';
    barColor = 'bg-cyan-400';
    glowColor = 'shadow-cyan-400/50';
    locationName = house?.name || '';
  } else if (state.currentNodeId && state.worldData) {
    const node = state.worldData.nodes.find(n => n.id === state.currentNodeId);
    progress = node?.progress || 0;
    label = '区域探索';
    barColor = 'bg-emerald-400';
    glowColor = 'shadow-emerald-400/50';
    locationName = node?.name || '';
  }

  if (!label) return null;

  const clampedProgress = Math.min(100, Math.round(progress));

  return (
    <div className="px-4 py-1.5 bg-zinc-900/80 backdrop-blur-sm border-b border-zinc-800 sticky top-0 z-10">
      <div className="max-w-3xl mx-auto flex items-center gap-3">
        <AnimatePresence mode="wait">
          <motion.span
            key={locationName}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="text-[11px] text-zinc-300 shrink-0 font-medium truncate max-w-[120px]"
            title={locationName}
          >
            {locationName}
          </motion.span>
        </AnimatePresence>
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
