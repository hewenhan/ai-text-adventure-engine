import { motion } from 'motion/react';
import { Target } from 'lucide-react';

interface FloatingObjectiveProps {
  description: string;
}

export function FloatingObjective({ description }: FloatingObjectiveProps) {
  return (
    <motion.div
      drag
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute top-4 left-4 z-20 max-w-xs cursor-grab active:cursor-grabbing select-none"
    >
      <div className="bg-zinc-900/90 backdrop-blur-md border border-amber-500/30 rounded-xl px-4 py-3 shadow-lg shadow-amber-500/5">
        <div className="flex items-center gap-2 mb-1">
          <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-400">当前目标</span>
        </div>
        <p className="text-xs text-zinc-300 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}
