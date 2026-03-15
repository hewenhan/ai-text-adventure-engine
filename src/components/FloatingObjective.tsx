import { motion } from 'motion/react';
import { Target } from 'lucide-react';
import { type RefObject } from 'react';
import type { QuestStage } from '../types/game';

interface FloatingObjectiveProps {
  description: string;
  targetLocationName?: string;
  constraintsRef: RefObject<HTMLDivElement | null>;
  questChain?: QuestStage[] | null;
  currentStageIndex?: number;
}

export function FloatingObjective({ description, targetLocationName, constraintsRef, questChain, currentStageIndex = 0 }: FloatingObjectiveProps) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={constraintsRef}
      dragElastic={0.1}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute bottom-4 right-4 z-20 max-w-xs cursor-grab active:cursor-grabbing select-none"
    >
      <div className="bg-zinc-900/90 backdrop-blur-md border border-amber-500/30 rounded-xl px-4 py-3 shadow-lg shadow-amber-500/5">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-400">当前目标</span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">{description}</p>
        {targetLocationName && (
          <p className="text-[11px] text-amber-300/80 mt-1">📍 {targetLocationName}</p>
        )}

        {/* Quest chain progress dots */}
        {questChain && questChain.length > 1 && (
          <div className="flex items-center gap-1.5 mt-2">
            {questChain.map((stage, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  stage.completed
                    ? 'bg-emerald-400'
                    : i === currentStageIndex
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-zinc-600'
                }`}
                title={`第${i + 1}环: ${stage.description.slice(0, 30)}...`}
              />
            ))}
            <span className="text-[10px] text-zinc-500 ml-1">
              {currentStageIndex + 1}/{questChain.length}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
