import { motion } from 'motion/react';
import { X, Heart, Shield, MapPin, Target } from 'lucide-react';
import { GameState } from '../types/game';

interface StatusSidebarProps {
  state: GameState;
  onClose: () => void;
}

export function StatusSidebar({ state, onClose }: StatusSidebarProps) {
  const currentNode = state.worldData?.nodes.find(n => n.id === state.currentNodeId);
  const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);

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
          {/* HP & Lives */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" /> 生命值
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>HP</span>
                <span className={state.hp <= 30 ? 'text-red-400' : state.hp <= 60 ? 'text-amber-400' : 'text-emerald-400'}>
                  {state.hp} / 100
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    state.hp <= 30 ? 'bg-red-500' : state.hp <= 60 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${state.hp}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>复活币</span>
                <div className="flex gap-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Shield key={i} className={`w-4 h-4 ${i < state.lives ? 'text-emerald-400' : 'text-zinc-700'}`} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Current Location */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> 当前位置
            </h3>
            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300 space-y-1">
              {currentNode ? (
                <>
                  <div><span className="text-zinc-500">区域：</span>{currentNode.name} ({currentNode.type})</div>
                  <div><span className="text-zinc-500">危险度：</span>{currentNode.safetyLevel}</div>
                  {currentHouse && (
                    <div><span className="text-zinc-500">建筑：</span>{currentHouse.name} ({currentHouse.type})</div>
                  )}
                  {!currentHouse && (
                    <div className="text-zinc-500 italic">户外街区</div>
                  )}
                </>
              ) : (
                <div className="text-zinc-500 italic">未知</div>
              )}
            </div>
          </div>

          {/* Current Objective */}
          {state.currentObjective && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                <Target className="w-3.5 h-3.5" /> 当前目标
              </h3>
              <div className="bg-amber-950/30 border border-amber-800/50 p-3 rounded-lg text-sm text-amber-200">
                🎯 {state.currentObjective.description}
              </div>
            </div>
          )}

          {/* Inventory */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">物品栏</h3>
            {state.inventory.length === 0 ? (
              <div className="text-zinc-600 italic text-sm">空</div>
            ) : (
              <ul className="space-y-2">
                {state.inventory.map((item: string, i: number) => (
                  <li key={i} className="bg-zinc-950 border border-zinc-800 p-2 rounded-lg text-sm">
                    {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Exploration Progress */}
          {Object.keys(state.progressMap).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">探索进度</h3>
              <div className="space-y-2">
                {Object.entries(state.progressMap).map(([key, val]) => {
                  // Resolve display name from key like "node_n3" or "house_h2_1"
                  let displayName = key;
                  if (state.worldData) {
                    if (key.startsWith('node_')) {
                      const nodeId = key.replace('node_', '');
                      const node = state.worldData.nodes.find(n => n.id === nodeId);
                      if (node) displayName = `${node.name}（区域）`;
                    } else if (key.startsWith('house_')) {
                      const houseId = key.replace('house_', '');
                      for (const node of state.worldData.nodes) {
                        const house = node.houses.find(h => h.id === houseId);
                        if (house) { displayName = `${house.name}（建筑）`; break; }
                      }
                    }
                  }
                  return (
                  <div key={key} className="text-sm">
                    <div className="flex justify-between text-zinc-300">
                      <span>{displayName}</span>
                      <span>{val}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${val}%` }} />
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Soft Status */}
          {Object.keys(state.status).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">状态效果</h3>
              <pre className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(state.status, null, 2)}
              </pre>
            </div>
          )}

          {/* World */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">世界观</h3>
            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300">
              {state.worldview}
            </div>
          </div>

          {/* Character Settings */}
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
