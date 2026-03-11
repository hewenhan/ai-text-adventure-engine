import { useState, useEffect, createContext, useContext, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

export type NotificationType = 'quest' | 'discovery' | 'milestone';

export interface GrandNotificationData {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
}

// ─── Context ────────────────────────────────────────────────────

interface GrandNotificationContextType {
  show: (data: Omit<GrandNotificationData, 'id'>) => void;
}

const GrandNotificationContext = createContext<GrandNotificationContextType>({
  show: () => {},
});

export function useGrandNotification() {
  return useContext(GrandNotificationContext);
}

// ─── Provider ───────────────────────────────────────────────────

export function GrandNotificationProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<GrandNotificationData[]>([]);
  const [current, setCurrent] = useState<GrandNotificationData | null>(null);

  const show = useCallback((data: Omit<GrandNotificationData, 'id'>) => {
    const item: GrandNotificationData = { ...data, id: `${Date.now()}_${Math.random()}` };
    setQueue(prev => [...prev, item]);
  }, []);

  // 当没有正在显示的通知且队列不为空时，弹出下一个
  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(prev => prev.slice(1));
    }
  }, [current, queue]);

  const dismiss = useCallback(() => {
    setCurrent(null);
  }, []);

  return (
    <GrandNotificationContext.Provider value={{ show }}>
      {children}
      <AnimatePresence>
        {current && (
          <GrandNotificationOverlay
            key={current.id}
            data={current}
            onDismiss={dismiss}
          />
        )}
      </AnimatePresence>
    </GrandNotificationContext.Provider>
  );
}

// ─── Overlay Component ──────────────────────────────────────────

function GrandNotificationOverlay({ data, onDismiss }: { data: GrandNotificationData; onDismiss: () => void }) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; size: number; delay: number; duration: number }[]>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      delay: Math.random() * 0.8,
      duration: Math.random() * 2 + 1.5,
    }));
    setParticles(newParticles);
  }, []);

  const typeConfig = {
    quest: {
      icon: '⚔️',
      accentColor: '#f59e0b',
      glowColor: 'rgba(245, 158, 11, 0.3)',
      borderColor: 'rgba(245, 158, 11, 0.5)',
      bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(217, 119, 6, 0.05))',
      label: '新任务',
    },
    discovery: {
      icon: '🗺️',
      accentColor: '#06b6d4',
      glowColor: 'rgba(6, 182, 212, 0.3)',
      borderColor: 'rgba(6, 182, 212, 0.5)',
      bgGradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1), rgba(8, 145, 178, 0.05))',
      label: '新发现',
    },
    milestone: {
      icon: '🏆',
      accentColor: '#a855f7',
      glowColor: 'rgba(168, 85, 247, 0.3)',
      borderColor: 'rgba(168, 85, 247, 0.5)',
      bgGradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.1), rgba(147, 51, 234, 0.05))',
      label: '里程碑',
    },
  }[data.type];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={onDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Particles */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
            x: [0, (Math.random() - 0.5) * 200],
            y: [0, (Math.random() - 0.5) * 200],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            repeatDelay: Math.random() * 2,
          }}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: typeConfig.accentColor,
            boxShadow: `0 0 ${p.size * 2}px ${typeConfig.glowColor}`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Card */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotateY: -15 }}
        animate={{ scale: 1, opacity: 1, rotateY: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 50 }}
        transition={{ type: 'spring', damping: 15, stiffness: 200 }}
        className="relative z-10 max-w-md w-full mx-4 rounded-2xl overflow-hidden"
        style={{
          background: typeConfig.bgGradient,
          border: `1px solid ${typeConfig.borderColor}`,
          boxShadow: `0 0 60px ${typeConfig.glowColor}, 0 0 120px ${typeConfig.glowColor}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Metal Sheen sweep */}
        <motion.div
          initial={{ x: '-100%' }}
          animate={{ x: '200%' }}
          transition={{ duration: 1.5, delay: 0.3, ease: 'easeInOut' }}
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.15) 45%, rgba(255,255,255,0.05) 55%, transparent 60%)`,
            zIndex: 1,
          }}
        />

        {/* Decorative top line */}
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeConfig.accentColor}, transparent)`,
          }}
        />

        {/* Content */}
        <div className="p-8 text-center relative z-10">
          {/* Close button */}
          <button
            onClick={onDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-full bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors text-zinc-400 hover:text-zinc-200"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Icon */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', delay: 0.2, damping: 10 }}
            className="text-5xl mb-4"
          >
            {typeConfig.icon}
          </motion.div>

          {/* Label */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-xs font-bold uppercase tracking-[0.3em] mb-2"
            style={{ color: typeConfig.accentColor }}
          >
            {typeConfig.label}
          </motion.div>

          {/* Title */}
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-2xl font-bold text-white mb-3"
          >
            {data.title}
          </motion.h2>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-sm text-zinc-300 leading-relaxed mb-6"
          >
            {data.description}
          </motion.p>

          {/* Dismiss hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-xs text-zinc-500"
          >
            点击任意处关闭
          </motion.div>
        </div>

        {/* Bottom decorative line */}
        <div
          className="h-1 w-full"
          style={{
            background: `linear-gradient(90deg, transparent, ${typeConfig.accentColor}, transparent)`,
          }}
        />
      </motion.div>
    </motion.div>
  );
}
