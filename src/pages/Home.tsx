import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Upload, Play, Settings, Globe, Plus, History } from 'lucide-react';

export default function Home() {
  const { state, updateState, loadSave, resetGame } = useGame();
  const { isAuthenticated, login, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempName, setTempName] = useState(() => {
    return state.characterSettings.name || '';
  });
  const [tempGender, setTempGender] = useState(() => {
    return state.characterSettings.gender || '女';
  });
  const [tempSettings, setTempSettings] = useState(() => {
    return state.characterSettings.description || '';
  });
  const [tempLanguage, setTempLanguage] = useState<'zh' | 'en'>(() => {
    return state.language || 'zh';
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSaveText, setPendingSaveText] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const hasSave = state.history && state.history.length > 0;

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
      try {
        const parsed = JSON.parse(text);
        if (!parsed.language) {
          setPendingSaveText(text);
          setShowLanguageModal(true);
        } else {
          if (loadSave(text)) {
            navigate('/chat');
          } else {
            alert("存档格式无效。");
          }
        }
      } catch (err) {
        alert("存档格式无效。");
      }
    };
    reader.readAsText(file);
  };

  const handleLanguageSelectForSave = (lang: 'zh' | 'en') => {
    if (pendingSaveText) {
      try {
        const parsed = JSON.parse(pendingSaveText);
        parsed.language = lang;
        if (loadSave(JSON.stringify(parsed))) {
          navigate('/chat');
        } else {
          alert("存档格式无效。");
        }
      } catch (err) {
        alert("存档处理失败。");
      }
    }
    setShowLanguageModal(false);
    setPendingSaveText(null);
  };

  const handleStartGame = () => {
    if (!isAuthenticated) {
      alert("请先连接 Google Drive 以启用图片保存功能。");
      return;
    }
    resetGame();
    updateState({ 
      characterSettings: {
        name: tempName,
        gender: tempGender,
        description: tempSettings,
        personality: '',
        background: '',
        hobbies: '',
        appearancePrompt: '',
        isFleshedOut: false
      }, 
      language: tempLanguage,
      isFirstRun: true 
    });
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <Settings className="w-4 h-4" /> 角色设定
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">姓名</label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-white/20 outline-none"
                  placeholder="例如：林星"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-500">语言</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'zh', label: '中文' },
                    { value: 'en', label: 'English' }
                  ].map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setTempLanguage(l.value as 'zh' | 'en')}
                      className={`p-2 rounded-xl text-xs border transition-colors ${
                        tempLanguage === l.value 
                          ? 'bg-white text-black border-white' 
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500">性别</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: '男', label: '男' },
                  { value: '女', label: '女' },
                  { value: '非二元', label: '非二元' },
                  { value: '保密', label: '保密' }
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setTempGender(g.value)}
                    className={`p-2 rounded-xl text-xs border transition-colors ${
                      tempGender === g.value 
                        ? 'bg-white text-black border-white' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500">简述</label>
              <textarea
                value={tempSettings}
                onChange={(e) => setTempSettings(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm focus:ring-2 focus:ring-white/20 outline-none resize-none h-24"
                placeholder="描述 AI 角色的大致设定..."
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <button 
              onClick={() => hasSave && navigate('/chat')}
              disabled={!hasSave}
              className={`flex items-center justify-center gap-2 p-4 rounded-xl transition-colors ${
                hasSave 
                  ? 'bg-white hover:bg-zinc-200 text-black' 
                  : 'bg-zinc-900/50 border border-zinc-800/50 text-zinc-600 cursor-not-allowed'
              }`}
            >
              <History className="w-5 h-5" />
              <span className="text-sm font-medium">继续游戏</span>
            </button>

            <label className="flex items-center justify-center gap-2 p-4 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl cursor-pointer transition-colors group">
              <Upload className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">读取存档</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>

            <button 
              onClick={handleStartGame}
              className={`flex items-center justify-center gap-2 p-4 rounded-xl transition-colors ${
                !hasSave 
                  ? 'bg-white hover:bg-zinc-200 text-black' 
                  : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white'
              }`}
            >
              <Plus className="w-5 h-5" />
              <span className="text-sm font-medium">开始新游戏</span>
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showLanguageModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-xl text-center space-y-6"
            >
              <Globe className="w-12 h-12 text-zinc-400 mx-auto" />
              <div>
                <h2 className="text-xl font-bold mb-2">选择语言 / Select Language</h2>
                <p className="text-zinc-400 text-sm">
                  此存档未包含语言设置。请选择 AI 回复的语言。<br/>
                  This save file does not contain a language setting. Please select the language for AI responses.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleLanguageSelectForSave('zh')}
                  className="p-4 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors"
                >
                  <div className="font-medium">中文</div>
                </button>
                <button
                  onClick={() => handleLanguageSelectForSave('en')}
                  className="p-4 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors"
                >
                  <div className="font-medium">English</div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
