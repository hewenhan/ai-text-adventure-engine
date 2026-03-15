import { forwardRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { FakeProgressBar, FakeProgressBarHandle } from './FakeProgressBar';
import { DEFAULT_LOADING_MESSAGES } from '../types/game';

interface FleshingOutOverlayProps {
  isWorld?: boolean;
  loadingMessages?: string[];
}

export const FleshingOutOverlay = forwardRef<FakeProgressBarHandle, FleshingOutOverlayProps>(({ isWorld, loadingMessages }, ref) => {
  const duration = isWorld ? 50000 : 45000;
  const label = isWorld ? '正在构建世界...' : '正在融入世界观...';

  const messages = loadingMessages && loadingMessages.length > 0 ? loadingMessages : DEFAULT_LOADING_MESSAGES;
  const [currentMsg, setCurrentMsg] = useState(() => messages[Math.floor(Math.random() * messages.length)]);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMsg(messages[Math.floor(Math.random() * messages.length)]);
    }, 2500);
    return () => clearInterval(interval);
  }, [messages]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div 
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl relative overflow-hidden"
      >
        <FakeProgressBar
          ref={ref}
          duration={duration}
          direction="ltr"
          gradientColors={isWorld ? ['#3b82f6', '#8b5cf6'] : ['#10b981', '#06b6d4']}
          animation="shimmer"
          attach="inborder"
          xPercent={0}
          yPercent={100}
          thickness={4}
        />
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
        <h3 className="text-lg font-medium">{label}</h3>
        <AnimatePresence mode="wait">
          <motion.p
            key={currentMsg}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="text-sm text-zinc-400"
          >
            {currentMsg}
          </motion.p>
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
});

FleshingOutOverlay.displayName = 'FleshingOutOverlay';
