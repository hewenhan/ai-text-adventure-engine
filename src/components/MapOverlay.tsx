import { motion } from 'motion/react';
import { X, MapPin, Lock, Eye } from 'lucide-react';
import { GameState } from '../types/game';

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

  const currentNodeId = state.currentNodeId;
  const currentHouseId = state.currentHouseId;

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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Map Image */}
          {state.mapImageUrl && (
            <div className="rounded-xl overflow-hidden border border-zinc-800">
              <img
                src={state.mapImageUrl}
                alt="World Map"
                className="w-full h-auto max-h-80 object-contain bg-zinc-950"
              />
            </div>
          )}
          {!state.mapImageUrl && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-6 text-center text-zinc-500 text-sm">
              地图图片生成中...
            </div>
          )}

          {/* Topology Graph */}
          <div className="space-y-3">
            {worldData.nodes.map(node => {
              const isCurrent = node.id === currentNodeId;
              const nodeProgress = state.progressMap[`node_${node.id}`] || 0;
              // Houses visible based on progress (every 30% reveals one)
              const visibleCount = Math.floor(nodeProgress / 30);

              return (
                <div
                  key={node.id}
                  className={`rounded-xl border p-4 transition-colors ${
                    isCurrent
                      ? 'border-white/50 bg-white/5 ring-1 ring-white/20'
                      : 'border-zinc-800 bg-zinc-950'
                  }`}
                >
                  {/* Node Header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isCurrent && <MapPin className="w-4 h-4 text-emerald-400" />}
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
                  <div className="text-xs text-zinc-500 mb-2">
                    连通：{node.connections.map(connId => {
                      const connNode = worldData.nodes.find(n => n.id === connId);
                      return connNode?.name || connId;
                    }).join(' · ')}
                  </div>

                  {/* Houses */}
                  <div className="flex flex-wrap gap-2">
                    {node.houses.map((house, idx) => {
                      const isVisible = idx < visibleCount || (isCurrent && house.id === currentHouseId);
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
                          className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border ${
                            isCurrentHouse
                              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                              : `${SAFETY_COLORS[house.safetyLevel]} text-zinc-300`
                          }`}
                        >
                          <Eye className="w-3 h-3" />
                          <span>{house.name}</span>
                          <span className="text-zinc-500">({TYPE_LABELS[house.type] || house.type})</span>
                          {houseProgress > 0 && (
                            <span className="text-zinc-500">{houseProgress}%</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
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
      </motion.div>
    </>
  );
}
