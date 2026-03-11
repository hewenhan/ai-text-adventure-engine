import { motion } from 'motion/react';
import { Target } from 'lucide-react';
import { useRef, useState, useCallback, useMemo } from 'react';

interface FloatingObjectiveProps {
  description: string;
}

export function FloatingObjective({ description }: FloatingObjectiveProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 0, h: 0 });

  const handleLayoutMeasure = useCallback(() => {
    if (cardRef.current) {
      setCardSize({ w: cardRef.current.offsetWidth, h: cardRef.current.offsetHeight });
    }
  }, []);

  // Compute drag constraints so card stays within the viewport
  const dragConstraints = useMemo(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    // Fixed position: bottom-24 (96px) right-4 (16px)
    // Initial CSS position: right=16, bottom=96
    // Constraints are relative to initial position
    const initialRight = 16;
    const initialBottom = 96;
    const initialLeft = vw - cardSize.w - initialRight;
    const initialTop = vh - cardSize.h - initialBottom;
    return {
      top: -initialTop,
      left: -initialLeft,
      right: initialRight,
      bottom: initialBottom,
    };
  }, [cardSize]);

  return (
    <motion.div
      ref={cardRef}
      drag
      dragMomentum={false}
      dragConstraints={dragConstraints}
      dragElastic={0.1}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onAnimationComplete={handleLayoutMeasure}
      className="fixed bottom-24 right-4 z-20 max-w-xs cursor-grab active:cursor-grabbing select-none"
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
