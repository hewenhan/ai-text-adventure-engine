import { Send, Backpack } from 'lucide-react';
import { useState, useRef, useLayoutEffect } from 'react';

interface ChatInputProps {
  isProcessing: boolean;
  onSend: (message: string) => Promise<void | boolean>;
  onBackpackClick?: () => void;
  inventoryCount?: number;
}

export function ChatInput({ isProcessing, onSend, onBackpackClick, inventoryCount = 0 }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const val = input;
    setInput("");
    await onSend(val);
  };

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea height
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`; // max ~6 lines
  }, [input]);

  return (
    <div className="p-4 bg-zinc-900/50 backdrop-blur-md border-t border-zinc-800 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="max-w-3xl mx-auto relative flex items-end gap-2">
        {/* Backpack button */}
        {onBackpackClick && (
          <button
            onClick={onBackpackClick}
            className="relative p-2.5 mb-2 bg-zinc-950 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors flex-shrink-0"
            title="背包"
          >
            <Backpack className="w-5 h-5 text-amber-400" />
            {inventoryCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                {inventoryCount}
              </span>
            )}
          </button>
        )}
        <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && !e.shiftKey && !isProcessing && input.trim()) {
              e.preventDefault();
              await handleSend();
            }
          }}
          placeholder={isProcessing ? "等待回复..." : "你要做什么？"}
          disabled={isProcessing}
          rows={1}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl py-3 pl-5 pr-12 focus:ring-2 focus:ring-white/20 outline-none disabled:opacity-50 resize-none overflow-y-hidden leading-normal"
          style={{ overflowY: input && textareaRef.current && textareaRef.current.scrollHeight > 160 ? 'auto' : 'hidden' }}
        />
        <button 
          onClick={handleSend}
          disabled={!input.trim() || isProcessing}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-full hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
        </div>
      </div>
    </div>
  );
}
