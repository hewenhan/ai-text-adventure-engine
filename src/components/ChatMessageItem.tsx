import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import { ChatMessage, ENABLE_DEBUG_UI } from '../types/game';
import { getImageUrlByName } from '../lib/drive';
import { useAuth } from '../contexts/AuthContext';
import { IMAGE_PROHIBITED_SENTINEL } from '../services/aiService';

interface ChatMessageItemProps {
  msg: ChatMessage;
  characterName: string;
  imageUrl?: string;
  onImageLoaded: (fileName: string, url: string) => void;
  onDelete?: () => void;
}

export const ChatMessageItem = React.memo(({ msg, characterName, imageUrl, onImageLoaded, onDelete }: ChatMessageItemProps) => {
  const { accessToken } = useAuth();
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const fetchImage = async () => {
      if (msg.imageFileName && msg.imageFileName !== IMAGE_PROHIBITED_SENTINEL && !imageUrl && accessToken) {
        setIsLoadingImage(true);
        const url = await getImageUrlByName(accessToken, msg.imageFileName);
        if (isMounted && url) {
          onImageLoaded(msg.imageFileName, url);
        }
        if (isMounted) setIsLoadingImage(false);
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [msg.imageFileName, imageUrl, accessToken, onImageLoaded]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "flex w-full mx-auto py-4 px-4 gap-3 relative group",
        msg.role === 'user' ? "justify-end" : "justify-start"
      )}
    >
      {/* AI Avatar Skeleton */}
      {msg.role !== 'user' && (
        <div className="w-10 h-10 rounded-full bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700 flex items-center justify-center mt-5">
          <span className="text-zinc-500 text-xs">{characterName[0]}</span>
        </div>
      )}

      <div className={clsx(
        "flex flex-col max-w-[75%]",
        msg.role === 'user' ? "items-end" : "items-start"
      )}>
        {/* Name */}
        <div className="text-xs text-zinc-500 mb-1 px-1">
          {msg.role === 'user' ? '你' : characterName}
        </div>

        {/* Bubble */}
        <div className={clsx(
          "rounded-2xl overflow-hidden shadow-sm relative w-fit", // w-fit makes it wrap content
          msg.role === 'user' ? "bg-emerald-600 text-white rounded-tr-sm" : "bg-zinc-900 border border-zinc-800 rounded-tl-sm"
        )}>
          {/* Debug Delete Button */}
          {ENABLE_DEBUG_UI && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
              }}
              className="absolute top-2 right-2 p-1.5 bg-red-500/80 text-white rounded-full z-10 shadow-md hover:bg-red-600 transition-colors cursor-pointer backdrop-blur-sm"
              title="Debug: Delete Message"
              type="button"
            >
              <Trash2 className="w-3 h-3 pointer-events-none" />
            </button>
          )}

          {/* Image Display */}
          {msg.imageFileName && (
            <div className="relative w-full min-w-[200px] sm:min-w-[280px] bg-zinc-950 flex justify-center">
              {msg.imageFileName === IMAGE_PROHIBITED_SENTINEL ? (
                <div className="w-full aspect-[9/16] max-h-[70vh] flex flex-col items-center justify-center text-yellow-600 gap-2">
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-xs">图片违规，无法生成</span>
                </div>
              ) : imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="Scene" 
                  className="w-full h-auto max-h-[70vh] object-contain cursor-pointer"
                  onClick={() => setIsFullscreen(true)}
                />
              ) : (
                <div className="w-full aspect-[9/16] max-h-[70vh] flex items-center justify-center text-zinc-600 gap-2">
                  {isLoadingImage ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">加载中...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-xs">未找到图片</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Text Content */}
          <div className="p-3 sm:p-4 text-sm leading-relaxed markdown-body break-words">
            <ReactMarkdown>{msg.text}</ReactMarkdown>
          </div>
        </div>
      </div>

      {/* User Avatar Skeleton */}
      {msg.role === 'user' && (
        <div className="w-10 h-10 rounded-full bg-zinc-700 shrink-0 overflow-hidden border border-zinc-600 flex items-center justify-center mt-5">
          <span className="text-zinc-400 text-xs">你</span>
        </div>
      )}

      {/* Fullscreen Image Overlay */}
      <AnimatePresence>
        {isFullscreen && imageUrl && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center overflow-hidden touch-none"
            onClick={() => {
              if (!isDragging.current) setIsFullscreen(false);
            }}
          >
            <motion.img
              src={imageUrl}
              alt="Fullscreen"
              drag
              dragConstraints={containerRef}
              dragElastic={0.1}
              onDragStart={() => { isDragging.current = true; }}
              onDragEnd={() => { 
                setTimeout(() => { isDragging.current = false; }, 150); 
              }}
              className="cursor-grab active:cursor-grabbing max-w-none max-h-none"
              onClick={(e) => {
                e.stopPropagation();
                if (!isDragging.current) {
                  setIsFullscreen(false);
                }
              }}
              draggable={false}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});
