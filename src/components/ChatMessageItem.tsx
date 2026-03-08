import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import { ChatMessage, ENABLE_DEBUG_UI } from '../types/game';
import { getImageUrlByName } from '../lib/drive';
import { useAuth } from '../contexts/AuthContext';

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

  useEffect(() => {
    let isMounted = true;

    const fetchImage = async () => {
      if (msg.imageFileName && !imageUrl && accessToken) {
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
        "flex flex-col max-w-3xl mx-auto py-4 px-4 relative group", // Added group for hover effect
        msg.role === 'user' ? "items-end" : "items-start"
      )}
    >
      <div className={clsx(
        "rounded-2xl overflow-hidden shadow-sm max-w-full w-full relative", // Ensure width constraints and relative positioning
        msg.role === 'user' ? "bg-white text-black rounded-tr-sm" : "bg-zinc-900 border border-zinc-800 rounded-tl-sm"
      )}>
        {/* Debug Delete Button */}
        {ENABLE_DEBUG_UI && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault(); // Prevent any default behavior
              console.log('Delete button clicked - index:', msg.id); // Log ID for reference
              // alert('Delete clicked!'); // Uncomment for extreme debugging
              onDelete();
            }}
            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full z-50 shadow-md hover:bg-red-600 transition-colors cursor-pointer"
            title="Debug: Delete Message"
            type="button" // Explicitly set type to button
          >
            <Trash2 className="w-4 h-4 pointer-events-none" />
          </button>
        )}

        {/* Image Display */}
        {msg.imageFileName && (
          <div className="relative w-full aspect-video bg-zinc-950">
            {imageUrl ? (
              <img 
                src={imageUrl} 
                alt="Scene" 
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600 gap-2">
                {isLoadingImage ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-xs">从 Drive 加载中...</span>
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
        <div className="p-4 text-sm leading-relaxed markdown-body">
          <ReactMarkdown>{msg.text}</ReactMarkdown>
        </div>
      </div>
      
      <div className="text-xs text-zinc-500 mt-1 px-1">
        {msg.role === 'user' ? '你' : characterName}
      </div>
    </motion.div>
  );
});
