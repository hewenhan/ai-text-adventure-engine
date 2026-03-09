import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';

export function FleshingOutOverlay() {
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
        className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl"
      >
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto" />
        <h3 className="text-lg font-medium">正在融入世界观...</h3>
        <p className="text-sm text-zinc-400">正在根据世界设定补全角色的详细背景、性格与特长，请稍候。</p>
      </motion.div>
    </motion.div>
  );
}
