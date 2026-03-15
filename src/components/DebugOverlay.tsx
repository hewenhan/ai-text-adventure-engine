import React, { useState, useMemo } from 'react';
import { GameState, ENABLE_DEBUG_UI, DebugOverrides } from '../types/game';
import { extractProgressMap } from '../lib/pipeline';

// ─── 子组件：带标签的数字输入 ───
const NumInput: React.FC<{
  label: string; value: number | ''; min?: number; max?: number;
  onChange: (v: number | undefined) => void;
}> = ({ label, value, min, max, onChange }) => (
  <label className="flex items-center gap-1">
    <span className="text-gray-400 w-16 shrink-0">{label}</span>
    <input
      type="number" min={min} max={max}
      value={value}
      onChange={e => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
      className="w-16 bg-black/60 border border-green-700/50 rounded px-1 py-0.5 text-green-300 text-xs"
    />
  </label>
);

// ─── 主面板 ───
interface DebugOverlayProps {
  state: GameState;
  onUpdateState: (updates: Partial<GameState>) => void;
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ state, onUpdateState }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'monitor' | 'override'>('monitor');

  // 从 worldData 提取扁平进度表供 debug 面板使用
  const progressMap = useMemo(
    () => state.worldData ? extractProgressMap(state.worldData) : {},
    [state.worldData]
  );

  // ── override 表单暂存 ──
  const [ovTension, setOvTension] = useState<number | ''>('');
  const [ovHp, setOvHp] = useState<number | ''>('');
  const [ovLives, setOvLives] = useState<number | ''>('');
  const [ovAffection, setOvAffection] = useState<number | ''>('');
  const [ovRoll, setOvRoll] = useState<number | ''>('');
  const [ovNodeId, setOvNodeId] = useState('');
  const [ovHouseId, setOvHouseId] = useState('');
  const [ovProgressKey, setOvProgressKey] = useState('');
  const [ovProgressVal, setOvProgressVal] = useState<number | ''>('');

  if (!ENABLE_DEBUG_UI) return null;

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-mono opacity-50 hover:opacity-100 transition-opacity"
      >
        DEBUG
      </button>
    );
  }

  // 读取上一回合 debugState
  const { pacingState } = state;
  const lastMessageWithDebug = [...state.history].reverse().find(m => m.debugState);
  const debugState = lastMessageWithDebug?.debugState;
  const pending = state.debugOverrides;
  const nodes = state.worldData?.nodes || [];
  const allHouses = nodes.flatMap(n => n.houses.map(h => ({ nodeId: n.id, nodeName: n.name, ...h })));

  // 提交覆写到 GameState.debugOverrides
  const applyOverrides = () => {
    const ov: DebugOverrides = {};
    if (ovTension !== '') ov.tensionLevel = Math.max(0, Math.min(4, ovTension)) as 0|1|2|3|4;
    if (ovHp !== '') ov.hp = ovHp;
    if (ovLives !== '') ov.lives = ovLives;
    if (ovAffection !== '') ov.affection = ovAffection;
    if (ovRoll !== '') ov.forcedRoll = Math.max(1, Math.min(20, ovRoll));
    if (ovNodeId) { ov.teleportNodeId = ovNodeId; ov.teleportHouseId = ovHouseId || null; }
    if (ovProgressKey && ovProgressVal !== '') {
      ov.progressOverride = { key: ovProgressKey, value: ovProgressVal };
    }
    if (Object.keys(ov).length > 0) onUpdateState({ debugOverrides: ov });
  };

  const clearOverrides = () => {
    onUpdateState({ debugOverrides: undefined });
    setOvTension(''); setOvHp(''); setOvLives(''); setOvAffection('');
    setOvRoll(''); setOvNodeId(''); setOvHouseId('');
    setOvProgressKey(''); setOvProgressVal('');
  };

  const tabBtn = (t: 'monitor' | 'override', label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-2 py-0.5 rounded text-[10px] ${tab === t ? 'bg-green-700 text-white' : 'text-green-500 hover:text-green-300'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
      <div className="absolute inset-0 pointer-events-auto" onClick={() => setIsOpen(false)} />

      <div className="relative m-4 w-96 max-h-[80vh] overflow-y-auto bg-black/85 backdrop-blur-md text-green-400 p-4 rounded-lg border border-green-500/30 font-mono text-xs shadow-2xl pointer-events-auto">
        {/* 标题栏 */}
        <div className="flex justify-between items-center mb-2 border-b border-green-500/30 pb-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold">DEBUG CONSOLE</h3>
            {tabBtn('monitor', 'MONITOR')}
            {tabBtn('override', 'OVERRIDE')}
          </div>
          <button onClick={() => setIsOpen(false)} className="text-red-400 hover:text-red-300">[X]</button>
        </div>

        {/* 挂起的覆写提示 */}
        {pending && Object.keys(pending).length > 0 && (
          <div className="bg-yellow-900/40 border border-yellow-600/50 rounded px-2 py-1 mb-2 text-yellow-300 text-[10px]">
            ⚡ 覆写已挂起，下一回合生效：{JSON.stringify(pending)}
          </div>
        )}

        {/* ═══ MONITOR TAB ═══ */}
        {tab === 'monitor' && (
          <div className="space-y-2">
            <div>
              <span className="text-gray-400">Tension:</span>{' '}
              <span className={`font-bold ${pacingState.tensionLevel >= 3 ? 'text-red-500' : 'text-green-300'}`}>
                {pacingState.tensionLevel}/4
              </span>
              <span className="ml-2 text-gray-500">({pacingState.turnsInCurrentLevel} turns)</span>
            </div>

            <div>
              <span className="text-gray-400">HP:</span>{' '}
              <span className={state.hp <= 30 ? 'text-red-400 font-bold' : 'text-green-300'}>{state.hp}/100</span>
              <span className="ml-2 text-gray-400">Lives:</span>{' '}
              <span className="text-yellow-300">{state.lives}</span>
              {state.isGameOver && <span className="text-red-500 font-bold ml-2">GAME OVER</span>}
            </div>

            <div>
              <span className="text-gray-400">Affection:</span>{' '}
              <span className={state.affection >= 60 ? 'text-pink-400' : state.affection >= 30 ? 'text-yellow-300' : 'text-red-400'}>
                {state.affection}/100
              </span>
            </div>

            <div>
              <span className="text-gray-400">Node:</span>{' '}
              <span className="text-cyan-300">{state.currentNodeId || 'null'}</span>
              <span className="ml-2 text-gray-400">House:</span>{' '}
              <span className="text-cyan-300">{state.currentHouseId || 'outdoor'}</span>
            </div>

            {state.transitState && (
              <div>
                <span className="text-gray-400">Transit:</span>{' '}
                <span className="text-orange-300">
                  {state.transitState.fromNodeId} → {state.transitState.toNodeId} ({state.transitState.pathProgress}%)
                </span>
              </div>
            )}

            <div>
              <span className="text-gray-400">Quest:</span>{' '}
              {state.currentObjective
                ? <span className="text-amber-300">{state.currentObjective.description}</span>
                : <span className="text-gray-600">无</span>}
            </div>

            {Object.keys(progressMap).length > 0 && (
              <div className="border-t border-gray-700 pt-2 mt-2">
                <div className="text-gray-300 font-bold mb-1">PROGRESS MAP</div>
                <div className="max-h-20 overflow-y-auto space-y-0.5">
                  {Object.entries(progressMap).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-cyan-400">{k}</span>: <span className={v >= 100 ? 'text-yellow-300 font-bold' : 'text-green-300'}>{v}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {debugState ? (
              <>
                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div className="text-gray-300 font-bold mb-1">LAST TURN</div>
                  <div className="grid grid-cols-2 gap-1">
                    <div>D20 Roll:</div>
                    <div className={debugState.lastIsSuccess ? 'text-green-400' : 'text-red-400'}>
                      {debugState.lastActionRoll}
                    </div>
                    <div>Result:</div>
                    <div>{debugState.lastIsSuccess ? 'SUCCESS' : 'FAILURE'}</div>
                    {debugState.lastIntent && (<><div>Intent:</div><div className="text-purple-300">{debugState.lastIntent}</div></>)}
                  </div>
                </div>

                {debugState.lastFormula && (
                  <div className="border-t border-gray-700 pt-2 mt-2">
                    <div className="text-gray-300 font-bold mb-1">FORMULA</div>
                    <div className="text-cyan-200 text-[10px] break-all whitespace-pre-wrap">{debugState.lastFormula}</div>
                  </div>
                )}

                {debugState.lastNarrativeInstruction && (
                  <div className="border-t border-gray-700 pt-2 mt-2">
                    <div className="text-gray-300 font-bold mb-1">NARRATIVE</div>
                    <div className="text-yellow-200 text-[10px] max-h-16 overflow-y-auto">{debugState.lastNarrativeInstruction}</div>
                  </div>
                )}

                <div className="border-t border-gray-700 pt-2 mt-2">
                  <div className="text-gray-300 font-bold mb-1">IMAGE</div>
                  <div className="break-all">
                    <span className="text-gray-400">Prompt: </span>
                    {debugState.lastImagePrompt
                      ? <span className="text-blue-300 truncate block h-4 overflow-hidden" title={debugState.lastImagePrompt}>{debugState.lastImagePrompt.substring(0, 50)}...</span>
                      : <span className="text-red-500">MISSING</span>}
                    {debugState.lastImageError && <div className="text-red-400 mt-1">Error: {debugState.lastImageError}</div>}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-gray-500 italic mt-2">No action data yet...</div>
            )}
          </div>
        )}

        {/* ═══ OVERRIDE TAB ═══ */}
        {tab === 'override' && (
          <div className="space-y-3">
            <div className="text-yellow-400 text-[10px] mb-1">设置后点「ARM」，下一回合自动生效并清除</div>

            {/* 数值覆写 */}
            <fieldset className="border border-green-800/50 rounded p-2 space-y-1">
              <legend className="text-gray-300 text-[10px] px-1">数值覆写</legend>
              <NumInput label="Tension" value={ovTension} min={0} max={4} onChange={v => setOvTension(v ?? '')} />
              <NumInput label="HP" value={ovHp} min={0} max={100} onChange={v => setOvHp(v ?? '')} />
              <NumInput label="Lives" value={ovLives} min={0} max={10} onChange={v => setOvLives(v ?? '')} />
              <NumInput label="Affect" value={ovAffection} min={0} max={100} onChange={v => setOvAffection(v ?? '')} />
              <NumInput label="D20" value={ovRoll} min={1} max={20} onChange={v => setOvRoll(v ?? '')} />
            </fieldset>

            {/* 传送 */}
            <fieldset className="border border-green-800/50 rounded p-2 space-y-1">
              <legend className="text-gray-300 text-[10px] px-1">传送</legend>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 w-16 shrink-0">Node</span>
                <select
                  value={ovNodeId}
                  onChange={e => { setOvNodeId(e.target.value); setOvHouseId(''); }}
                  className="flex-1 bg-black/60 border border-green-700/50 rounded px-1 py-0.5 text-green-300 text-xs"
                >
                  <option value="">--</option>
                  {nodes.map(n => <option key={n.id} value={n.id}>{n.id} ({n.name})</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 w-16 shrink-0">House</span>
                <select
                  value={ovHouseId}
                  onChange={e => setOvHouseId(e.target.value)}
                  className="flex-1 bg-black/60 border border-green-700/50 rounded px-1 py-0.5 text-green-300 text-xs"
                >
                  <option value="">outdoor</option>
                  {nodes.find(n => n.id === ovNodeId)?.houses.map(h =>
                    <option key={h.id} value={h.id}>{h.id} ({h.name})</option>
                  )}
                </select>
              </div>
            </fieldset>

            {/* 进度覆写 */}
            <fieldset className="border border-green-800/50 rounded p-2 space-y-1">
              <legend className="text-gray-300 text-[10px] px-1">进度覆写</legend>
              <div className="flex items-center gap-1">
                <span className="text-gray-400 w-16 shrink-0">Key</span>
                <select
                  value={ovProgressKey}
                  onChange={e => setOvProgressKey(e.target.value)}
                  className="flex-1 bg-black/60 border border-green-700/50 rounded px-1 py-0.5 text-green-300 text-xs"
                >
                  <option value="">--</option>
                  {Object.keys(progressMap).map(k => <option key={k} value={k}>{k} ({progressMap[k]}%)</option>)}
                  {nodes.map(n => <option key={`node_${n.id}`} value={`node_${n.id}`}>node_{n.id}</option>)}
                  {allHouses.map(h => <option key={`house_${h.id}`} value={`house_${h.id}`}>house_{h.id}</option>)}
                </select>
              </div>
              <NumInput label="Value" value={ovProgressVal} min={0} max={100} onChange={v => setOvProgressVal(v ?? '')} />
            </fieldset>

            {/* 任务操控 */}
            <fieldset className="border border-green-800/50 rounded p-2 space-y-1">
              <legend className="text-gray-300 text-[10px] px-1">任务操控</legend>
              <div className="flex gap-1">
                <button
                  onClick={() => onUpdateState({ debugOverrides: { ...state.debugOverrides, clearQuest: true } })}
                  className="flex-1 bg-red-800/60 hover:bg-red-700/60 text-red-300 rounded px-2 py-1 text-[10px]"
                >
                  清除当前任务
                </button>
                {nodes.length > 0 && (
                  <button
                    onClick={() => {
                      const rn = nodes[Math.floor(Math.random() * nodes.length)];
                      const rh = rn.houses[Math.floor(Math.random() * rn.houses.length)];
                      if (rh) {
                        onUpdateState({
                          debugOverrides: {
                            ...state.debugOverrides,
                            forceQuest: { targetNodeId: rn.id, targetHouseId: rh.id, targetLocationName: `${rn.name}·${rh.name}`, description: `[DEBUG] 前往${rn.name}·${rh.name}` }
                          }
                        });
                      }
                    }}
                    className="flex-1 bg-amber-800/60 hover:bg-amber-700/60 text-amber-300 rounded px-2 py-1 text-[10px]"
                  >
                    随机派发任务
                  </button>
                )}
              </div>
            </fieldset>

            {/* 快捷预设 */}
            <fieldset className="border border-green-800/50 rounded p-2 space-y-1">
              <legend className="text-gray-300 text-[10px] px-1">快捷预设</legend>
              <div className="flex flex-wrap gap-1">
                <button onClick={() => { setOvHp(1); setOvTension(3); }} className="bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 rounded px-2 py-0.5 text-[10px]">濒死危机</button>
                <button onClick={() => { setOvHp(100); setOvTension(0); setOvLives(3); }} className="bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 rounded px-2 py-0.5 text-[10px]">满血安全</button>
                <button onClick={() => setOvRoll(20)} className="bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 rounded px-2 py-0.5 text-[10px]">D20=20</button>
                <button onClick={() => setOvRoll(1)} className="bg-gray-700/60 hover:bg-gray-600/60 text-gray-300 rounded px-2 py-0.5 text-[10px]">D20=1</button>
                <button onClick={() => onUpdateState({ debugOverrides: { forceGameOver: true } })} className="bg-red-900/60 hover:bg-red-800/60 text-red-400 rounded px-2 py-0.5 text-[10px]">强制 GAME OVER</button>
              </div>
            </fieldset>

            {/* ARM / CLEAR */}
            <div className="flex gap-2 pt-1">
              <button onClick={applyOverrides} className="flex-1 bg-green-700 hover:bg-green-600 text-white font-bold rounded py-1 text-xs">
                ⚡ ARM（挂载覆写）
              </button>
              <button onClick={clearOverrides} className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded py-1 text-xs">
                CLEAR
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
