import { useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ZoomableImageProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

export function ZoomableImage({ src, alt, isOpen, onClose }: ZoomableImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isDragging = useRef(false);
  const [scale, setScale] = useState(1);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  // Pinch state refs (avoid re-renders during gesture)
  const lastPinchDist = useRef(0);
  const pinchActive = useRef(false);

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    setScale(prev => clampScale(prev - e.deltaY * 0.002));
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchActive.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist.current = Math.hypot(dx, dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchActive.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastPinchDist.current > 0) {
        const ratio = dist / lastPinchDist.current;
        setScale(prev => clampScale(prev * ratio));
      }
      lastPinchDist.current = dist;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchActive.current = false;
    lastPinchDist.current = 0;
  }, []);

  const resetOnClose = useCallback(() => {
    if (!isDragging.current) {
      onClose();
      setScale(1);
    }
  }, [onClose]);

  // Compute pixel-level drag constraints from scaled image vs viewport
  const dragConstraints = useMemo(() => {
    if (scale <= 1) return { top: 0, bottom: 0, left: 0, right: 0 };
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const scaledW = imgSize.w * scale;
    const scaledH = imgSize.h * scale;
    // How far the image overflows the viewport on each axis (half on each side)
    const overflowX = Math.max(0, (scaledW - vw) / 2);
    const overflowY = Math.max(0, (scaledH - vh) / 2);
    return { top: -overflowY, bottom: overflowY, left: -overflowX, right: overflowX };
  }, [scale, imgSize]);

  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setImgSize({ w: imgRef.current.offsetWidth, h: imgRef.current.offsetHeight });
    }
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={containerRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden touch-none"
          onClick={resetOnClose}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <motion.img
            ref={imgRef}
            src={src}
            alt={alt}
            drag
            dragConstraints={dragConstraints}
            dragElastic={0.1}
            onDragStart={() => { isDragging.current = true; }}
            onDragEnd={() => {
              setTimeout(() => { isDragging.current = false; }, 150);
            }}
            style={{ scale }}
            className="cursor-grab active:cursor-grabbing max-w-[100vw] max-h-[100vh] object-contain"
            onClick={(e) => {
              e.stopPropagation();
              resetOnClose();
            }}
            onLoad={handleImageLoad}
            draggable={false}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
