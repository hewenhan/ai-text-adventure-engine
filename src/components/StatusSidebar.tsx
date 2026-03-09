import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { GameState } from '../types/game';

interface StatusSidebarProps {
  state: GameState;
  onClose: () => void;
}

export function StatusSidebar({ state, onClose }: StatusSidebarProps) {
  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm z-20"
      />
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="absolute right-0 top-0 bottom-0 w-80 bg-zinc-900 border-l border-zinc-800 z-30 p-6 overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">状态</h2>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">物品栏</h3>
            {(!state.status?.inventory || state.status.inventory.length === 0) ? (
              <div className="text-zinc-600 italic text-sm">空</div>
            ) : (
              <ul className="space-y-2">
                {state.status.inventory.map((item: string, i: number) => (
                  <li key={i} className="bg-zinc-950 border border-zinc-800 p-2 rounded-lg text-sm">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">角色状态</h3>
            <pre className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-xs overflow-x-auto">
              {JSON.stringify(state.status, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">世界观</h3>
            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300">
              {state.worldview}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">角色设定</h3>
            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300 space-y-2">
              <div><span className="text-zinc-500">姓名：</span>{state.characterSettings.name}</div>
              <div><span className="text-zinc-500">性别：</span>{state.characterSettings.gender}</div>
              <div><span className="text-zinc-500">简述：</span>{state.characterSettings.description}</div>
              {state.characterSettings.personality && <div><span className="text-zinc-500">性格：</span>{state.characterSettings.personality}</div>}
              {state.characterSettings.background && <div><span className="text-zinc-500">经历：</span>{state.characterSettings.background}</div>}
              {state.characterSettings.hobbies && <div><span className="text-zinc-500">特长/爱好：</span>{state.characterSettings.hobbies}</div>}
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
