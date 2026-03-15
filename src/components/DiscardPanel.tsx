import { motion, AnimatePresence } from 'motion/react';
import { Package, Trash2 } from 'lucide-react';
import { RARITY_COLORS, type InventoryItem } from '../types/game';
import { useState } from 'react';

interface DiscardPanelProps {
  /** The new item waiting to enter the bag */
  incomingItem: InventoryItem | null;
  /** Current inventory */
  inventory: InventoryItem[];
  /** Called with the ID of the item to discard (frees slot for incomingItem) */
  onDiscard: (itemId: string) => void;
}

export function DiscardPanel({ incomingItem, inventory, onDiscard }: DiscardPanelProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (!incomingItem) return null;

  const discardable = inventory.filter(i => i.type !== 'quest');

  return (
    <AnimatePresence>
      {incomingItem && (
        <>
          {/* Backdrop — no click-to-dismiss, must pick an item */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]"
          />

          <motion.div
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-zinc-900 border-t border-amber-500/30 rounded-t-2xl max-h-[80vh] overflow-hidden flex flex-col"
          >
            {/* Header: incoming item */}
            <div className="p-4 border-b border-zinc-800">
              <p className="text-xs text-amber-400 mb-2 font-medium">背包已满！选择一件道具丢弃：</p>
              <div
                className="flex items-center gap-3 bg-zinc-950 rounded-lg p-3 border"
                style={{ borderColor: RARITY_COLORS[incomingItem.rarity] }}
              >
                <span className="text-2xl">{incomingItem.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm" style={{ color: RARITY_COLORS[incomingItem.rarity] }}>
                    {incomingItem.name}
                  </div>
                  <div className="text-xs text-zinc-400 truncate">{incomingItem.description}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Package className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-amber-400">待入袋</span>
                </div>
              </div>
            </div>

            {/* Discardable items list */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                {discardable.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-zinc-950 rounded-lg p-3 border border-zinc-800 hover:border-zinc-600 transition-colors"
                  >
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: RARITY_COLORS[item.rarity] }}>
                        {item.name}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {item.type === 'weapon' ? '武器' : item.type === 'armor' ? '防具' : '退敌'}
                        {item.buff != null && <span className="text-amber-400 ml-1">+{item.buff}%</span>}
                      </div>
                    </div>
                    {confirmId === item.id ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => onDiscard(item.id)}
                          className="px-2.5 py-1 text-xs bg-red-600 hover:bg-red-500 rounded-lg transition-colors font-medium"
                        >
                          确认丢弃
                        </button>
                        <button
                          onClick={() => setConfirmId(null)}
                          className="px-2.5 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmId(item.id)}
                        className="p-1.5 hover:bg-red-950 rounded-lg transition-colors text-red-400 shrink-0"
                        title="丢弃此物品"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Show quest items as non-discardable */}
                {inventory.filter(i => i.type === 'quest').map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 bg-zinc-950/50 rounded-lg p-3 border border-zinc-800/50 opacity-40"
                  >
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-zinc-500">{item.name}</div>
                      <div className="text-xs text-zinc-600">任务道具 · 不可丢弃</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
