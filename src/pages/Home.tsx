import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Upload, Play, Settings, Save } from 'lucide-react';

export default function Home() {
  const { state, updateState, loadSave, resetGame } = useGame();
  const { isAuthenticated, login, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempSettings, setTempSettings] = useState(state.characterSettings);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleReconnect = async () => {
    setIsRefreshing(true);
    const success = await refreshSession();
    if (!success) {
      // If refresh fails, try full login
      login();
    }
    setIsRefreshing(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (loadSave(text)) {
        navigate('/chat');
      } else {
        alert("存档格式无效。");
      }
    };
    reader.readAsText(file);
  };

  const handleStartGame = () => {
    if (!isAuthenticated) {
      alert("请先连接 Google Drive 以启用图片保存功能。");
      return;
    }
    resetGame();
    updateState({ characterSettings: tempSettings, isFirstRun: true });
    navigate('/setup');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-8"
      >
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent">
            AI 角色扮演冒险
          </h1>
          <p className="text-zinc-400">沉浸式生成式视觉叙事体验</p>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl space-y-6 backdrop-blur-sm">
          
          {/* Auth Status */}
          <div className="flex items-center justify-between p-4 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">
                {isAuthenticated ? 'Google Drive 已连接' : 'Drive 未连接'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isAuthenticated && (
                <button 
                  onClick={handleReconnect}
                  disabled={isRefreshing}
                  className="text-xs bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  {isRefreshing ? '刷新中...' : '重新连接'}
                </button>
              )}
              {!isAuthenticated && (
                <button 
                  onClick={login}
                  className="text-xs bg-white text-black px-3 py-1.5 rounded-full font-medium hover:bg-zinc-200 transition-colors"
                >
                  连接
                </button>
              )}
            </div>
          </div>

          {/* Character Settings */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Settings className="w-4 h-4" /> 角色设定
              </label>
            </div>
            <textarea
              value={tempSettings}
              onChange={(e) => setTempSettings(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-white/20 outline-none resize-none h-24"
              placeholder="描述 AI 角色..."
            />
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl cursor-pointer transition-colors group">
              <Upload className="w-6 h-6 text-zinc-500 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">读取存档</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>

            <button 
              onClick={handleStartGame}
              className="flex flex-col items-center justify-center gap-2 p-4 bg-white hover:bg-zinc-200 text-black rounded-xl transition-colors"
            >
              <Play className="w-6 h-6" />
              <span className="text-sm font-medium">开始新游戏</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
