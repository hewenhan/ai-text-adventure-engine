import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Upload, Globe, Plus, History, Sparkles, Dice5, ImageIcon, BookOpen } from 'lucide-react';
import { APP_DESCRIPTION, APP_SUBTITLE, APP_TITLE } from '../lib/appMeta';

export default function Home() {
  const { state, updateState, loadSave, resetGame } = useGame();
  const { isAuthenticated, login, refreshSession } = useAuth();
  const navigate = useNavigate();
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
            {APP_TITLE}
          </h1>
          <p className="text-zinc-300 text-base font-medium leading-relaxed">{APP_SUBTITLE}</p>
          <p className="text-zinc-500 text-sm leading-6 max-w-md mx-auto">{APP_DESCRIPTION}</p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Sparkles, label: '沉浸式对话', desc: '和 AI 搭档自由互动' },
            { icon: Dice5, label: '命运骰子', desc: '每次行动都有惊喜' },
            { icon: ImageIcon, label: '实时插画', desc: '场景自动生成画面' },
            { icon: BookOpen, label: '自由世界', desc: '你来定义故事舞台' },
          ].map((f) => (
            <div key={f.label} className="flex items-start gap-2.5 p-3 bg-zinc-900/40 border border-zinc-800/60 rounded-xl">
              <f.icon className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-300">{f.label}</p>
                <p className="text-[11px] text-zinc-500">{f.desc}</p>
              </div>
            </div>
          ))}
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

          {/* Language */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">AI 回复语言</label>
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
