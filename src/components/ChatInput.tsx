import { Send } from 'lucide-react';
import { useState } from 'react';

interface ChatInputProps {
  isProcessing: boolean;
  onSend: (message: string) => Promise<void | boolean>;
}

export function ChatInput({ isProcessing, onSend }: ChatInputProps) {
  const [input, setInput] = useState("");

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const val = input;
    setInput("");
    await onSend(val);
  };

  return (
    <div className="p-4 bg-zinc-900/50 backdrop-blur-md border-t border-zinc-800">
      <div className="max-w-3xl mx-auto relative">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === 'Enter' && !isProcessing && input.trim()) {
              await handleSend();
            }
          }}
          placeholder={isProcessing ? "等待回复..." : "你要做什么？"}
          disabled={isProcessing}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-full py-3 pl-5 pr-12 focus:ring-2 focus:ring-white/20 outline-none disabled:opacity-50"
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
  );
}
