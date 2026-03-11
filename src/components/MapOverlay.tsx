import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { X, MapPin, Lock, Eye, ArrowRight, Target } from 'lucide-react';
import { GameState, WorldData } from '../types/game';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrlByName } from '../lib/drive';
import { ZoomableImage } from './ZoomableImage';

interface MapOverlayProps {
  state: GameState;
  onClose: () => void;
}

const SAFETY_COLORS: Record<string, string> = {
  safe: 'border-emerald-500 bg-emerald-500/10',
  low: 'border-blue-500 bg-blue-500/10',
  medium: 'border-amber-500 bg-amber-500/10',
  high: 'border-orange-500 bg-orange-500/10',
  deadly: 'border-red-500 bg-red-500/10',
};

const SAFETY_LABELS: Record<string, string> = {
  safe: '安全',
  low: '低危',
  medium: '中危',
  high: '高危',
  deadly: '致命',
};

const TYPE_LABELS: Record<string, string> = {
  city: '城市',
  town: '城镇',
  village: '村落',
  wilderness: '荒野',
  housing: '住所',
  shop: '商铺',
  inn: '旅店',
  facility: '设施',
};

export function MapOverlay({ state, onClose }: MapOverlayProps) {
  const worldData = state.worldData;
  if (!worldData) return null;

  const { accessToken } = useAuth();
  const currentNodeId = state.currentNodeId;
  const currentHouseId = state.currentHouseId;
  const [isMapFullscreen, setIsMapFullscreen] = useState(false);
  const [mapImageUrl, setMapImageUrl] = useState<string | null>(null);

  // Load map image: either from Drive (filename) or direct data URL
  useEffect(() => {
    if (!state.mapImageFileName) return;
    if (state.mapImageFileName.startsWith('data:')) {
      setMapImageUrl(state.mapImageFileName);
      return;
    }
    if (!accessToken) return;
    let cancelled = false;
    getImageUrlByName(accessToken, state.mapImageFileName).then(url => {
      if (!cancelled && url) setMapImageUrl(url);
    });
    return () => { cancelled = true; };
  }, [state.mapImageFileName, accessToken]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-4 md:inset-8 lg:inset-16 bg-zinc-900 border border-zinc-700 rounded-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-bold">{worldData.name} — 世界地图</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-zinc-800 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transit Banner: 赶路状态横幅 */}
        {state.transitState && (
          <div className="bg-blue-900/20 border-b border-blue-500/30 p-4 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-blue-400 font-medium">
                <span>{worldData.nodes.find(n => n.id === state.transitState!.fromNodeId)?.name}</span>
                <ArrowRight className="w-4 h-4 animate-pulse" />
                <span>{worldData.nodes.find(n => n.id === state.transitState!.toNodeId)?.name}</span>
              </div>
              <span className="text-blue-300 text-sm">{state.transitState.pathProgress}%</span>
            </div>
            <div className="w-full h-2 bg-blue-950 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all duration-500 relative"
                style={{ width: `${state.transitState.pathProgress}%` }}
              >
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              </div>
            </div>
            <div className="text-xs text-blue-500/70 mt-1">正在野外长途跋涉...</div>
          </div>
        )}

        {/* Content — on mobile: single scroll; on lg+: side-by-side, only cards scroll */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden p-4">
          <div className="flex flex-col lg:flex-row gap-6 lg:h-full">

          {/* Left: Map Image — fixed on desktop, scrolls on mobile */}
          <div className="w-full lg:flex-[3_1_0%] lg:min-w-0 lg:h-full lg:flex lg:flex-col">
            {mapImageUrl ? (
              <div className="rounded-xl overflow-hidden border border-zinc-800 lg:flex-1 lg:min-h-0 flex items-center justify-center bg-zinc-950">
                <img
                  src={mapImageUrl}
                  alt="World Map"
                  className="w-full h-auto max-h-80 lg:max-h-full lg:h-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setIsMapFullscreen(true)}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-500 text-sm">
                地图图片生成中...
              </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-2 text-xs text-zinc-500 mt-3 flex-shrink-0">
              <span className="font-medium text-zinc-400">图例：</span>
              {Object.entries(SAFETY_LABELS).map(([key, label]) => (
                <span key={key} className={`px-1.5 py-0.5 rounded border ${SAFETY_COLORS[key]}`}>
                  {label}
                </span>
              ))}
              <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> 未探索</span>
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-emerald-400" /> 当前位置</span>
            </div>
          </div>

          {/* Right: Topology Graph — independently scrollable on desktop */}
          <div className="w-full lg:flex-[2_1_0%] lg:min-w-[340px] lg:overflow-y-auto lg:h-full space-y-3 pt-3">
            {/* Connection Graph SVG */}
            <TopologyGraph worldData={worldData} currentNodeId={currentNodeId} objectiveNodeId={state.currentObjective?.targetNodeId} transitState={state.transitState} />

            {worldData.nodes.map(node => {
              const isCurrent = node.id === currentNodeId;
              const isObjectiveNode = state.currentObjective?.targetNodeId === node.id;
              const nodeProgress = state.progressMap[`node_${node.id}`] || 0;
              // Houses visible based on progress (every 30% reveals one) OR objective target
              const visibleCount = Math.floor(nodeProgress / 30);

              return (
                <div
                  key={node.id}
                  className={`rounded-xl border p-4 transition-all relative ${
                    isCurrent
                      ? 'border-emerald-500/60 bg-emerald-500/5 ring-2 ring-emerald-500/25 shadow-[0_0_15px_rgba(16,185,129,0.15)]'
                      : 'border-zinc-800 bg-zinc-950'
                  }`}
                >
                  {/* Current location badge */}
                  {isCurrent && (
                    <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-emerald-600 text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg">
                      <MapPin className="w-3 h-3" />
                      当前所在
                    </div>
                  )}
                  {isObjectiveNode && !isCurrent && (
                    <div className="absolute -top-2.5 left-4 px-2 py-0.5 bg-amber-600 text-white text-xs font-medium rounded-full flex items-center gap-1 shadow-lg">
                      <Target className="w-3 h-3" />
                      任务目标
                    </div>
                  )}

                  {/* Node Header */}
                  <div className={`flex items-center justify-between mb-2 ${isCurrent ? 'mt-1' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{node.name}</span>
                      <span className="text-xs text-zinc-500">{TYPE_LABELS[node.type] || node.type}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${SAFETY_COLORS[node.safetyLevel]}`}>
                        {SAFETY_LABELS[node.safetyLevel]}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500">
                      探索 {nodeProgress}%
                    </div>
                  </div>

                  {/* Node Progress Bar */}
                  <div className="w-full h-1 bg-zinc-800 rounded-full mb-3 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${nodeProgress}%` }}
                    />
                  </div>

                  {/* Connections */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-3 text-xs">
                    <ArrowRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                    <span className="text-zinc-500">可前往</span>
                    {node.connections.map(connId => {
                      const connNode = worldData.nodes.find(n => n.id === connId);
                      return (
                        <span
                          key={connId}
                          className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 hover:border-zinc-500 transition-colors"
                        >
                          {connNode?.name || connId}
                        </span>
                      );
                    })}
                  </div>

                  {/* Houses */}
                  <div className="flex flex-wrap gap-2">
                    {node.houses.map((house, idx) => {
                      const isObjectiveHouse = state.currentObjective?.targetHouseId === house.id;
                      const isVisible = idx < visibleCount || (isCurrent && house.id === currentHouseId) || isObjectiveHouse;
                      const isCurrentHouse = isCurrent && house.id === currentHouseId;
                      const houseProgress = state.progressMap[`house_${house.id}`] || 0;

                      if (!isVisible) {
                        return (
                          <div
                            key={house.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-600"
                          >
                            <Lock className="w-3 h-3" />
                            <span>???</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={house.id}
                          className={`flex flex-col gap-1 px-2 py-1.5 rounded-lg border w-full sm:w-auto ${
                            isCurrentHouse
                              ? 'border-emerald-500/50 bg-emerald-500/10'
                              : isObjectiveHouse
                              ? 'border-amber-500/50 bg-amber-500/10'
                              : `${SAFETY_COLORS[house.safetyLevel]} bg-zinc-900/50`
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-1.5">
                              <Eye className={`w-3 h-3 ${isCurrentHouse ? 'text-emerald-400' : 'text-zinc-400'}`} />
                              <span className={`text-xs ${isCurrentHouse ? 'text-emerald-300 font-medium' : 'text-zinc-300'}`}>
                                {house.name}
                              </span>
                              <span className="text-[10px] text-zinc-500">({TYPE_LABELS[house.type] || house.type})</span>
                            </div>
                            {houseProgress > 0 && (
                              <span className="text-[10px] font-mono text-zinc-400">{houseProgress}%</span>
                            )}
                          </div>
                          {houseProgress > 0 && (
                            <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden mt-0.5">
                              <div 
                                className={`h-full rounded-full transition-all ${isCurrentHouse ? 'bg-emerald-500' : 'bg-zinc-500'}`}
                                style={{ width: `${houseProgress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          </div>
        </div>
      </motion.div>

      {/* Fullscreen Map Image Overlay */}
      {mapImageUrl && (
        <ZoomableImage src={mapImageUrl} alt="Fullscreen Map" isOpen={isMapFullscreen} onClose={() => setIsMapFullscreen(false)} />
      )}
    </>
  );
}

// ─── Topology Connection Graph ──────────────────────────────────

const SAFETY_DOT_COLORS: Record<string, string> = {
  safe: '#10b981',
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  deadly: '#ef4444',
};

function TopologyGraph({ worldData, currentNodeId, objectiveNodeId, transitState }: {
  worldData: WorldData;
  currentNodeId: string | null;
  objectiveNodeId?: string;
  transitState: GameState['transitState'];
}) {
  const nodes = worldData.nodes;

  // BFS-layered layout for readable graph
  const positions = useMemo(() => {
    const layers: string[][] = [];
    const visited = new Set<string>();
    if (nodes.length === 0) return {};
    const start = nodes[0].id;
    const queue: { id: string; depth: number }[] = [{ id: start, depth: 0 }];
    visited.add(start);

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (!layers[depth]) layers[depth] = [];
      layers[depth].push(id);
      const node = nodes.find(n => n.id === id);
      if (node) {
        for (const connId of node.connections) {
          if (!visited.has(connId)) {
            visited.add(connId);
            queue.push({ id: connId, depth: depth + 1 });
          }
        }
      }
    }
    // Orphan nodes
    for (const n of nodes) {
      if (!visited.has(n.id)) {
        if (!layers[layers.length]) layers.push([]);
        layers[layers.length - 1].push(n.id);
      }
    }

    const pos: Record<string, { x: number; y: number }> = {};
    const colCount = layers.length;
    for (let col = 0; col < colCount; col++) {
      const layer = layers[col];
      for (let row = 0; row < layer.length; row++) {
        pos[layer[row]] = {
          x: ((col + 1) / (colCount + 1)) * 100,
          y: ((row + 1) / (layer.length + 1)) * 100,
        };
      }
    }
    return pos;
  }, [nodes]);

  // Deduplicated edges
  const edges = useMemo(() => {
    const set = new Set<string>();
    const result: { from: string; to: string }[] = [];
    for (const node of nodes) {
      for (const connId of node.connections) {
        const key = [node.id, connId].sort().join('-');
        if (!set.has(key)) {
          set.add(key);
          result.push({ from: node.id, to: connId });
        }
      }
    }
    return result;
  }, [nodes]);

  const svgW = 420;
  const svgH = Math.max(160, nodes.length * 28);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-2 overflow-x-auto">
      <div className="text-xs text-zinc-500 px-2 pb-1 font-medium">路线连接图</div>
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" style={{ minWidth: 280 }}>
        {/* Edges */}
        {edges.map(({ from, to }) => {
          const p1 = positions[from];
          const p2 = positions[to];
          if (!p1 || !p2) return null;
          const isTransitEdge = transitState && (
            (transitState.fromNodeId === from && transitState.toNodeId === to) ||
            (transitState.fromNodeId === to && transitState.toNodeId === from)
          );
          return (
            <line
              key={`${from}-${to}`}
              x1={p1.x * svgW / 100}
              y1={p1.y * svgH / 100}
              x2={p2.x * svgW / 100}
              y2={p2.y * svgH / 100}
              stroke={isTransitEdge ? '#3b82f6' : '#3f3f46'}
              strokeWidth={isTransitEdge ? 2.5 : 1.5}
              strokeDasharray={isTransitEdge ? '6 3' : undefined}
            />
          );
        })}
        {/* Nodes */}
        {nodes.map(node => {
          const p = positions[node.id];
          if (!p) return null;
          const isCurrent = node.id === currentNodeId;
          const isObjective = node.id === objectiveNodeId;
          const cx = p.x * svgW / 100;
          const cy = p.y * svgH / 100;
          const fill = SAFETY_DOT_COLORS[node.safetyLevel] || '#71717a';
          return (
            <g key={node.id}>
              {(isCurrent || isObjective) && (
                <circle cx={cx} cy={cy} r={11} fill={isCurrent ? '#10b98130' : '#f59e0b30'} />
              )}
              <circle
                cx={cx} cy={cy} r={6}
                fill={fill}
                stroke={isCurrent ? '#10b981' : isObjective ? '#f59e0b' : '#27272a'}
                strokeWidth={isCurrent || isObjective ? 2.5 : 1.5}
              />
              <text
                x={cx}
                y={cy + 16}
                textAnchor="middle"
                fill={isCurrent ? '#10b981' : isObjective ? '#f59e0b' : '#a1a1aa'}
                fontSize={9}
                fontWeight={isCurrent || isObjective ? 'bold' : 'normal'}
              >
                {node.name.length > 8 ? node.name.slice(0, 7) + '…' : node.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
