import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { FakeProgressBar, FakeProgressBarHandle } from './FakeProgressBar';

interface RetryDialogState {
  visible: boolean;
  retrying: boolean;
  title: string;
  message: string;
}

const INITIAL: RetryDialogState = {
  visible: false,
  retrying: false,
  title: '',
  message: '',
};

/**
 * Hook that provides a retry-confirm dialog for failed AI requests.
 * Usage:
 *   const { retryDialog, showRetry } = useRetryDialog();
 *   // in JSX: {retryDialog}
 *   // on error: await showRetry('标题', '描述', retryFn);
 */
export function useRetryDialog() {
  const [dialog, setDialog] = useState<RetryDialogState>(INITIAL);
  const progressRef = useRef<FakeProgressBarHandle>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const retryFnRef = useRef<(() => Promise<void>) | null>(null);

  const close = useCallback((ok: boolean) => {
    progressRef.current?.finish();
    setTimeout(() => {
      setDialog(INITIAL);
      resolveRef.current?.(ok);
      resolveRef.current = null;
      retryFnRef.current = null;
    }, 300);
  }, []);

  const handleRetry = useCallback(async () => {
    if (!retryFnRef.current) return;
    setDialog(prev => ({ ...prev, retrying: true }));
    try {
      await retryFnRef.current();
      close(true);
    } catch {
      // Retry also failed — keep dialog open for another attempt
      progressRef.current?.finish();
      setDialog(prev => ({ ...prev, retrying: false }));
    }
  }, [close]);

  const handleCancel = useCallback(() => {
    close(false);
  }, [close]);

  /**
   * Show the retry dialog. Returns a promise that resolves to true if the
   * retry eventually succeeds, or false if the user cancels.
   */
  const showRetry = useCallback(
    (title: string, message: string, retryFn: () => Promise<void>): Promise<boolean> => {
      retryFnRef.current = retryFn;
      return new Promise<boolean>(resolve => {
        resolveRef.current = resolve;
        setDialog({ visible: true, retrying: false, title, message });
      });
    },
    [],
  );

  const retryDialog = (
    <AnimatePresence>
      {dialog.visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', duration: 0.35 }}
            className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl relative overflow-hidden"
          >
            {/* Progress bar shown during retry */}
            {dialog.retrying && (
              <FakeProgressBar
                ref={progressRef}
                duration={30000}
                direction="ltr"
                gradientColors={['#f59e0b', '#ef4444']}
                animation="shimmer"
                attach="inborder"
                xPercent={0}
                yPercent={100}
                thickness={4}
              />
            )}

            {dialog.retrying ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto" />
                <h3 className="text-lg font-medium text-zinc-100">重试中...</h3>
                <p className="text-sm text-zinc-400">{dialog.title}，请稍候</p>
              </>
            ) : (
              <>
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                <h3 className="text-lg font-medium text-zinc-100">{dialog.title}</h3>
                <p className="text-sm text-zinc-400">{dialog.message}</p>
                <div className="flex gap-3 justify-center pt-2">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleRetry}
                    className="px-4 py-2 text-sm rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors"
                  >
                    重试
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { retryDialog, showRetry };
}
