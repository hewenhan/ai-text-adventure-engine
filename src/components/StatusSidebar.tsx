import { motion } from 'motion/react';
import { X, Heart, Shield, MapPin, Target } from 'lucide-react';
import { GameState } from '../types/game';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrlByName } from '../lib/drive';
import { useEffect, useState, useMemo } from 'react';
import { extractProgressMap } from '../lib/pipeline';

interface StatusSidebarProps {
  state: GameState;
  onClose: () => void;
}

export function StatusSidebar({ state, onClose }: StatusSidebarProps) {
  const currentNode = state.worldData?.nodes.find(n => n.id === state.currentNodeId);
  const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);
  const { accessToken } = useAuth();
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);

  const progressMap = useMemo(
    () => state.worldData ? extractProgressMap(state.worldData) : {},
    [state.worldData]
  );

  useEffect(() => {
    if (!state.characterPortraitFileName || !accessToken) return;
    let cancelled = false;
    getImageUrlByName(accessToken, state.characterPortraitFileName).then(url => {
      if (!cancelled && url) setPortraitUrl(url);
    });
    return () => { cancelled = true; };
  }, [state.characterPortraitFileName, accessToken]);

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30"
      />
      <motion.div 
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        className="absolute right-0 top-0 bottom-0 w-80 max-w-full bg-zinc-900 border-l border-zinc-800 z-40 p-4 sm:p-6 overflow-y-auto"
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
              {state.hpDescription && (
                <div className="text-xs text-zinc-400 italic">{state.hpDescription}</div>
              )}
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

          {/* Affection */}
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
              <Heart className="w-3.5 h-3.5" fill={state.affection >= 60 ? 'currentColor' : 'none'} /> 好感度
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{state.companionProfile.name}</span>
                <span className={state.affection >= 80 ? 'text-pink-400' : state.affection >= 60 ? 'text-rose-400' : state.affection >= 20 ? 'text-zinc-300' : 'text-zinc-600'}>
                  {state.affection} / 100
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all ${
                    state.affection >= 80 ? 'bg-pink-500' : state.affection >= 60 ? 'bg-rose-500' : state.affection >= 20 ? 'bg-zinc-500' : 'bg-zinc-700'
                  }`}
                  style={{ width: `${state.affection}%` }}
                />
              </div>
              <div className="text-xs text-zinc-500 italic">
                {state.affection >= 80 ? '亲密无间' : state.affection >= 60 ? '好友' : state.affection >= 40 ? '普通' : state.affection >= 20 ? '冷淡' : '敌视'}
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
          <div>
            <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider flex items-center gap-1">
              <Target className="w-3.5 h-3.5" /> 当前目标
            </h3>
            {state.currentObjective ? (
              <div className="bg-amber-950/30 border border-amber-800/50 p-3 rounded-lg text-sm text-amber-200">
                🎯 {state.currentObjective.description}
              </div>
            ) : (
              <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-500 italic">
                无目标
              </div>
            )}
          </div>

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
          {Object.keys(progressMap).length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">探索进度</h3>
              <div className="space-y-2">
                {Object.entries(progressMap).map(([key, val]) => {
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
              {portraitUrl && (
                <div className="flex justify-center mb-3">
                  <img src={portraitUrl} alt="角色头像" className="w-24 h-24 rounded-full object-cover border-2 border-zinc-700" />
                </div>
              )}
              <div><span className="text-zinc-500">姓名：</span>{state.companionProfile.name}</div>
              {state.companionProfile.gender && <div><span className="text-zinc-500">性别：</span>{state.companionProfile.gender === 'Male' ? '男' : state.companionProfile.gender === 'Female' ? '女' : state.companionProfile.gender === 'Non-binary' ? '非二元' : '其他'}</div>}
              {state.companionProfile.age && <div><span className="text-zinc-500">年龄：</span>{state.companionProfile.age}</div>}
              {state.companionProfile.orientation && <div><span className="text-zinc-500">性取向：</span>{state.companionProfile.orientation === 'Heterosexual' ? '异性恋' : state.companionProfile.orientation === 'Homosexual' ? '同性恋' : state.companionProfile.orientation === 'Bisexual' ? '双性恋' : state.companionProfile.orientation === 'Pansexual' ? '泛性恋' : state.companionProfile.orientation === 'Asexual' ? '无性恋' : state.companionProfile.orientation}</div>}
              {state.companionProfile.skinColor && <div><span className="text-zinc-500">肤色：</span>{state.companionProfile.skinColor}</div>}
              {state.companionProfile.height && <div><span className="text-zinc-500">身高：</span>{state.companionProfile.height}</div>}
              {state.companionProfile.weight && <div><span className="text-zinc-500">体型：</span>{state.companionProfile.weight}</div>}
              {state.companionProfile.hairStyle && <div><span className="text-zinc-500">发型：</span>{state.companionProfile.hairStyle}</div>}
              {state.companionProfile.hairColor && <div><span className="text-zinc-500">发色：</span>{state.companionProfile.hairColor}</div>}
              <div><span className="text-zinc-500">简述：</span>{state.companionProfile.description}</div>
              {state.companionProfile.personalityDesc && <div><span className="text-zinc-500">自述性格：</span>{state.companionProfile.personalityDesc}</div>}
              {state.companionProfile.personality && <div><span className="text-zinc-500">性格：</span>{state.companionProfile.personality}</div>}
              {state.companionProfile.background && <div><span className="text-zinc-500">经历：</span>{state.companionProfile.background}</div>}
              {state.companionProfile.specialties && <div><span className="text-zinc-500">特长：</span>{state.companionProfile.specialties}</div>}
              {state.companionProfile.hobbies && <div><span className="text-zinc-500">爱好：</span>{state.companionProfile.hobbies}</div>}
              {state.companionProfile.dislikes && <div><span className="text-zinc-500">厌恶：</span>{state.companionProfile.dislikes}</div>}
            </div>
          </div>

          {/* Player Profile */}
          {state.playerProfile.name && (
            <div>
              <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">玩家档案</h3>
              <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300 space-y-1">
                <div><span className="text-zinc-500">姓名：</span>{state.playerProfile.name}</div>
                {state.playerProfile.gender && <div><span className="text-zinc-500">性别：</span>{
                  state.playerProfile.gender === 'Male' ? '男' :
                  state.playerProfile.gender === 'Female' ? '女' :
                  state.playerProfile.gender === 'Non-binary' ? '非二元' : '其他'
                }</div>}
                {state.playerProfile.age && <div><span className="text-zinc-500">年龄：</span>{state.playerProfile.age}</div>}
                {state.playerProfile.orientation && <div><span className="text-zinc-500">性取向：</span>{state.playerProfile.orientation === 'Heterosexual' ? '异性恋' : state.playerProfile.orientation === 'Homosexual' ? '同性恋' : state.playerProfile.orientation === 'Bisexual' ? '双性恋' : state.playerProfile.orientation === 'Pansexual' ? '泛性恋' : state.playerProfile.orientation === 'Asexual' ? '无性恋' : state.playerProfile.orientation}</div>}
                {state.playerProfile.skinColor && <div><span className="text-zinc-500">肤色：</span>{state.playerProfile.skinColor}</div>}
                {state.playerProfile.height && <div><span className="text-zinc-500">身高：</span>{state.playerProfile.height}</div>}
                {state.playerProfile.weight && <div><span className="text-zinc-500">体型：</span>{state.playerProfile.weight}</div>}
                {state.playerProfile.hairStyle && <div><span className="text-zinc-500">发型：</span>{state.playerProfile.hairStyle}</div>}
                {state.playerProfile.hairColor && <div><span className="text-zinc-500">发色：</span>{state.playerProfile.hairColor}</div>}
                {state.playerProfile.personalityDesc && <div><span className="text-zinc-500">性格：</span>{state.playerProfile.personalityDesc}</div>}
                {state.playerProfile.specialties && <div><span className="text-zinc-500">特长：</span>{state.playerProfile.specialties}</div>}
                {state.playerProfile.hobbies && <div><span className="text-zinc-500">爱好：</span>{state.playerProfile.hobbies}</div>}
                {state.playerProfile.dislikes && <div><span className="text-zinc-500">厌恶：</span>{state.playerProfile.dislikes}</div>}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
