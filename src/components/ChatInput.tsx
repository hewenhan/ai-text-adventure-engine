import { Send, Volume2, VolumeX, Volume1, ChevronsRight } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import type { TextSpeed } from './TypewriterMessage';

interface ChatInputProps {
  isProcessing: boolean;
  onSend: (message: string) => Promise<void | boolean>;
  volume: number;
  onVolumeChange: (v: number) => void;
  textSpeed: TextSpeed;
  onTextSpeedChange: (speed: TextSpeed) => void;
}

export function ChatInput({ isProcessing, onSend, volume, onVolumeChange, textSpeed, onTextSpeedChange }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showVolume, setShowVolume] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;
    const val = input;
    setInput("");
    await onSend(val);
  };

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // Desktop: hover behavior
  const handleMouseEnter = () => {
    if (hideTimeout.current) clearTimeout(hideTimeout.current);
    setShowVolume(true);
  };
  const handleMouseLeave = () => {
    if (isDragging.current) return;
    hideTimeout.current = setTimeout(() => setShowVolume(false), 300);
  };

  // Mobile: tap toggle
  const handleVolumeToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    setShowVolume(prev => !prev);
  };

  // Close volume on outside tap (mobile)
  useEffect(() => {
    if (!showVolume) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolume(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [showVolume]);

  // Volume slider drag logic
  const updateVolumeFromEvent = useCallback((clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    let currentTop = clientY - rect.top;
    if (currentTop > rect.height) {
      currentTop = rect.height;
    } else if (currentTop < 0) {
      currentTop = 0;
    }
    const ratio = 1 - currentTop / rect.height;
    console.log("Volume ratio:", ratio);
    console.log("Volume in range 0-1:", Math.max(0, Math.min(1, ratio)));
    onVolumeChange(Math.max(0, Math.min(1, ratio)));
  }, [onVolumeChange]);

  const handleSliderPointerDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateVolumeFromEvent(e.clientY);
  }, [updateVolumeFromEvent]);

  const handleSliderPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updateVolumeFromEvent(e.clientY);
  }, [updateVolumeFromEvent]);

  const handleSliderPointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const cycleTextSpeed = useCallback(() => {
    const order: TextSpeed[] = ['normal', 'fast', 'instant'];
    const idx = order.indexOf(textSpeed);
    onTextSpeedChange(order[(idx + 1) % order.length]);
  }, [textSpeed, onTextSpeedChange]);

  const speedLabel = textSpeed === 'normal' ? '1x' : textSpeed === 'fast' ? '2x' : '∞';

  return (
    <div className="p-4 bg-zinc-900/50 backdrop-blur-md border-t border-zinc-800">
      <div className="max-w-3xl mx-auto relative flex items-center gap-2">
        {/* Volume control */}
        <div
          ref={volumeRef}
          className="relative"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <button
            onClick={handleVolumeToggle}
            className="p-2 bg-zinc-950 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors shrink-0"
            title="音量"
          >
            <VolumeIcon className="w-4 h-4 text-zinc-400" />
          </button>

          {/* Vertical volume slider popup */}
          {showVolume && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-900 border border-zinc-800 rounded-xl p-2 flex flex-col items-center gap-1.5 shadow-xl z-50"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <span className="text-[10px] text-zinc-500 select-none">{Math.round(volume * 100)}</span>
              <div
                ref={trackRef}
                className="relative w-6 h-24 flex items-end justify-center cursor-pointer touch-none"
                onPointerDown={handleSliderPointerDown}
                onPointerMove={handleSliderPointerMove}
                onPointerUp={handleSliderPointerUp}
              >
                {/* Track background */}
                <div className="absolute inset-x-0 mx-auto w-1.5 h-full bg-zinc-700 rounded-full" />
                {/* Filled portion */}
                <div
                  className="absolute inset-x-0 mx-auto w-1.5 bg-white rounded-full"
                  style={{ height: `${volume * 100}%`, bottom: 0 }}
                />
                {/* Thumb */}
                <div
                  className="absolute w-3.5 h-3.5 bg-white rounded-full shadow-md border-2 border-zinc-900 left-1/2 -translate-x-1/2"
                  style={{ bottom: `calc(${volume * 100}% - 7px)` }}
                />
              </div>
              {/* Mute/unmute button */}
              <button
                onClick={() => onVolumeChange(volume === 0 ? 0.5 : 0)}
                className="p-1 hover:bg-zinc-800 rounded-full transition-colors"
              >
                {volume === 0
                  ? <VolumeX className="w-3 h-3 text-zinc-400" />
                  : <Volume2 className="w-3 h-3 text-zinc-400" />
                }
              </button>
            </div>
          )}
        </div>

        {/* Text speed toggle */}
        <button
          onClick={cycleTextSpeed}
          className={`p-2 border rounded-full transition-colors shrink-0 ${
            textSpeed === 'normal'
              ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-800'
              : textSpeed === 'fast'
              ? 'bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30'
              : 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30'
          }`}
          title={`打字速度: ${speedLabel}`}
        >
          <div className="relative w-4 h-4 flex items-center justify-center">
            <ChevronsRight className={`w-4 h-4 ${
              textSpeed === 'normal' ? 'text-zinc-400' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
            }`} />
            <span className={`absolute -top-1 -right-1.5 text-[8px] font-bold ${
              textSpeed === 'normal' ? 'text-zinc-500' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
            }`}>{speedLabel}</span>
          </div>
        </button>

        {/* Text input */}
        <div className="relative flex-1">
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
    </div>
  );
}
