import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Backpack, Zap } from 'lucide-react';
import { RARITY_COLORS, INVENTORY_CAPACITY, type InventoryItem } from '../types/game';
import { useState } from 'react';

interface InventoryPanelProps {
  inventory: InventoryItem[];
  isOpen: boolean;
  onClose: () => void;
  onDiscard: (itemId: string) => void;
  onUse: (item: InventoryItem) => void;
}

export function InventoryPanel({ inventory, isOpen, onClose, onDiscard, onUse }: InventoryPanelProps) {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  const handleDiscard = (itemId: string) => {
    onDiscard(itemId);
    setConfirmDiscard(null);
    setSelectedItem(null);
  };

  const handleUse = (item: InventoryItem) => {
    onUse(item);
    setSelectedItem(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Panel — centered modal */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col pointer-events-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
              <div className="flex items-center gap-2">
                <Backpack className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-bold">背包</h2>
                <span className="text-sm text-zinc-400">
                  {inventory.length}/{INVENTORY_CAPACITY}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Grid + Detail */}
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: INVENTORY_CAPACITY }).map((_, idx) => {
                  const item = inventory[idx] ?? null;
                  return (
                    <button
                      key={idx}
                      onClick={() => item && setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`aspect-square rounded-lg border-2 flex flex-col items-center justify-center text-center transition-all ${
                        item
                          ? selectedItem?.id === item.id
                            ? 'border-white bg-zinc-800 scale-105'
                            : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'
                          : 'border-zinc-800 bg-zinc-950/50'
                      }`}
                      style={item ? { borderColor: selectedItem?.id === item.id ? undefined : RARITY_COLORS[item.rarity] + '66' } : undefined}
                      disabled={!item}
                    >
                      {item ? (
                        <>
                          <span className="text-xl">{item.icon}</span>
                          <span
                            className="text-[10px] leading-tight truncate w-full px-1 mt-0.5"
                            style={{ color: RARITY_COLORS[item.rarity] }}
                          >
                            {item.name}
                          </span>
                        </>
                      ) : (
                        <span className="text-zinc-700 text-xs">空</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected item detail */}
              <AnimatePresence mode="wait">
                {selectedItem && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden"
                  >
                    <div
                      className="bg-zinc-950 border rounded-lg p-3"
                      style={{ borderColor: RARITY_COLORS[selectedItem.rarity] }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-2xl shrink-0">{selectedItem.icon}</span>
                          <div className="min-w-0">
                            <div
                              className="font-bold text-sm"
                              style={{ color: RARITY_COLORS[selectedItem.rarity] }}
                            >
                              {selectedItem.name}
                            </div>
                            <div className="text-xs text-zinc-500 flex items-center gap-2">
                              <span>{selectedItem.type === 'weapon' ? '武器' : selectedItem.type === 'armor' ? '防具' : selectedItem.type === 'escape' ? '退敌' : '任务'}</span>
                              <span style={{ color: RARITY_COLORS[selectedItem.rarity] }}>{selectedItem.rarity}</span>
                              {selectedItem.buff != null && (
                                <span className="text-amber-400">+{selectedItem.buff}%</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Use button */}
                          <button
                            onClick={() => handleUse(selectedItem)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 rounded-lg transition-colors font-medium"
                          >
                            <Zap className="w-3 h-3" />
                            使用
                          </button>

                          {/* Discard button (not for quest items) */}
                          {selectedItem.type !== 'quest' && (
                            confirmDiscard === selectedItem.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDiscard(selectedItem.id)}
                                  className="px-2 py-1.5 text-xs bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
                                >
                                  确认
                                </button>
                                <button
                                  onClick={() => setConfirmDiscard(null)}
                                  className="px-2 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDiscard(selectedItem.id)}
                                className="p-1.5 hover:bg-red-950 rounded-lg transition-colors text-red-400"
                                title="丢弃"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </div>
                      {/* Description — always visible */}
                      <p className="text-xs text-zinc-400 mt-2 leading-relaxed">{selectedItem.description}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
