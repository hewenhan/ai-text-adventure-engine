import { useState, useEffect, useRef, useCallback, memo } from 'react';
import ReactMarkdown from 'react-markdown';

export type TextSpeed = 'normal' | 'fast' | 'instant';

/** 人类阅读速度：每秒 6-8 个字，取 7 */
const CHARS_PER_SECOND = 7;

// ─── 打字机音效（Web Audio API 程序化生成，无需外部文件）───
let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playClickSound(volume: number = 0.1) {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.frequency.value = 600 + Math.random() * 400;
    oscillator.type = 'square';
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.03);
  } catch {
    // 静默忽略音频错误
  }
}

interface TypewriterMessageProps {
  text: string;
  animate: boolean;
  speed: TextSpeed;
  /** 总动画时长（毫秒），打字速度会据此自适应分配 */
  durationMs?: number;
  /** 是否是最后一条消息（用于显示光标） */
  isLastModelMessage?: boolean;
  /** 打字完成回调 */
  onComplete?: () => void;
}

export const TypewriterMessage = memo(function TypewriterMessage({
  text,
  animate,
  speed,
  durationMs,
  isLastModelMessage = false,
  onComplete,
}: TypewriterMessageProps) {
  const shouldAnimate = animate && speed !== 'instant';
  const [displayedLength, setDisplayedLength] = useState(shouldAnimate ? 0 : text.length);
  const rafRef = useRef<number | null>(null);
  const lastSoundRef = useRef(0);
  const completeFiredRef = useRef(!shouldAnimate);
  // 用于标记组件是新添加还是懒加载恢复的
  const mountedTickRef = useRef(0);

  const isComplete = displayedLength >= text.length;
  const showCursor = isLastModelMessage || (shouldAnimate && !isComplete);

  const clearTimer = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // 打字完成时触发回调
  useEffect(() => {
    if (isComplete && !completeFiredRef.current) {
      completeFiredRef.current = true;
      onComplete?.();
    }
  }, [isComplete, onComplete]);

  // 当 animate 变为 false（不再是最新消息）→ 立即展示全文
  useEffect(() => {
    if (!animate) {
      clearTimer();
      setDisplayedLength(text.length);
    }
  }, [animate, text.length, clearTimer]);

  // 打字动画：使用 rAF + 自然节奏
  useEffect(() => {
    if (!shouldAnimate || displayedLength >= text.length) {
      clearTimer();
      return;
    }

    clearTimer();
    mountedTickRef.current++;

    // 按阅读速度计算总时长：每秒 CHARS_PER_SECOND 个字
    const totalLen = text.length;
    const baseDuration = durationMs ?? Math.max(800, (totalLen / CHARS_PER_SECOND) * 1000);
    const avgInterval = Math.max(5, baseDuration / totalLen);

    let currentLen = displayedLength;
    let lastTime = performance.now();
    let accum = 0;

    function tick(now: number) {
      const dt = now - lastTime;
      lastTime = now;
      // 随机化间隔：有时快有时慢
      const jitter = avgInterval * (0.3 + Math.random() * 1.4);
      accum += dt;

      if (accum >= jitter) {
        // 偶尔一次出 2 个字（30%概率）
        const chars = Math.random() < 0.3 ? 2 : 1;
        currentLen = Math.min(totalLen, currentLen + chars);
        accum = 0;
        setDisplayedLength(currentLen);
      }

      if (currentLen < totalLen) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAnimate, speed, text]);

  // 音效节流：每 4 个字符播放一次，且跳过初始渲染（防止懒加载重放）
  useEffect(() => {
    if (!shouldAnimate || isComplete) return;
    // 跳过首帧（mount 时触发的 displayedLength=0 → 不播放）
    if (mountedTickRef.current <= 1 && displayedLength <= 1) return;
    if (displayedLength - lastSoundRef.current >= 4) {
      lastSoundRef.current = displayedLength;
      playClickSound();
    }
  }, [displayedLength, shouldAnimate, isComplete]);

  // 长按快进：按下时立即跳到全文（同时静音，不触发中间音效）
  const skipToEnd = useCallback(() => {
    if (!isComplete) {
      clearTimer();
      setDisplayedLength(text.length);
    }
  }, [isComplete, text.length, clearTimer]);

  const displayedText = displayedLength >= text.length ? text : text.slice(0, displayedLength);

  // 自定义 Markdown 渲染器：不再需要，光标由 CSS ::after 实现

  return (
    <div
      onMouseDown={!isComplete ? skipToEnd : undefined}
      onTouchStart={!isComplete ? skipToEnd : undefined}
      className={`select-text${showCursor ? ' typewriter-cursor' : ''}`}
    >
      <ReactMarkdown>{displayedText}</ReactMarkdown>
    </div>
  );
});
