import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Backpack, ChevronsRight, Heart, Home, Loader2, Map, MoreHorizontal, RefreshCw, Save, Volume1, Volume2, VolumeX } from 'lucide-react';
import { CharacterProfile, DEFAULT_PROFILE, DEFAULT_LOADING_MESSAGES, INITIAL_STATE, type Gender, type Orientation } from '../types/game';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { DebugOverlay } from '../components/DebugOverlay';
import { useChatLogic } from '../hooks/useChatLogic';
import { useBGM } from '../hooks/useBGM';
import { ChatInput } from '../components/ChatInput';
import { ProgressTracker } from '../components/ProgressTracker';
import { type TextSpeed } from '../components/TypewriterMessage';
import { ProfileModal } from '../components/ProfileModal';
import { StatusSidebar } from '../components/StatusSidebar';
import { MapOverlay } from '../components/MapOverlay';
import { FleshingOutOverlay } from '../components/FleshingOutOverlay';
import { DriveToast } from '../components/DriveToast';
import { FakeProgressBar, FakeProgressBarHandle } from '../components/FakeProgressBar';
import { FloatingObjective } from '../components/FloatingObjective';
import { uploadImageToDrive, getImageUrlByName } from '../lib/drive';
import { initializeWorld, fetchCustomLoadingMessages, generateMapImage, generateCharacterPortrait } from '../services/aiService';

export default function Chat() {
  const { state, updateState, exportSave } = useGame();
  const { isAuthenticated, driveError, reconnectDrive, accessToken } = useAuth();
  const navigate = useNavigate();
  const [showStatus, setShowStatus] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [textSpeed, setTextSpeed] = useState<TextSpeed>('normal');
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [driveToastDismissed, setDriveToastDismissed] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  
  // Affection change animation
  const [affectionDelta, setAffectionDelta] = useState<number | null>(null);
  const [affectionAnimKey, setAffectionAnimKey] = useState(0);
  const prevAffectionRef = useRef(state.affection);
  const affectionInitRef = useRef(false);
  
  useEffect(() => {
    if (!affectionInitRef.current) {
      affectionInitRef.current = true;
      prevAffectionRef.current = state.affection;
      return;
    }
    const delta = state.affection - prevAffectionRef.current;
    prevAffectionRef.current = state.affection;
    if (delta !== 0) {
      setAffectionDelta(delta);
      setAffectionAnimKey(k => k + 1);
      const timer = setTimeout(() => setAffectionDelta(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [state.affection]);

  // Progress bar refs for loading overlays
  const worldProgressRef = useRef<FakeProgressBarHandle>(null);
  const characterProgressRef = useRef<FakeProgressBarHandle>(null);

  // 已播放过打字动画的消息 ID 集合（防止 Virtuoso 卸载/重挂时重新打字）
  const animatedIdsRef = useRef<Set<string>>(new Set(state.history.map(m => m.id)));

  const { isProcessing, handleTurn, flushPendingNotifications } = useChatLogic();

  // BGM: find the latest bgmKey from chat history
  const currentBgmKey = useMemo(() => {
    for (let i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].bgmKey) return state.history[i].bgmKey;
    }
    return undefined;
  }, [state.history]);
  const { volume, changeVolume } = useBGM(currentBgmKey);

  // Load character portrait from Drive
  useEffect(() => {
    if (!state.characterPortraitFileName || !accessToken) return;
    let cancelled = false;
    getImageUrlByName(accessToken, state.characterPortraitFileName).then(url => {
      if (!cancelled && url) setPortraitUrl(url);
    });
    return () => { cancelled = true; };
  }, [state.characterPortraitFileName, accessToken]);

  // Loading Message State
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(DEFAULT_LOADING_MESSAGES[0]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      const messages = state.loadingMessages && state.loadingMessages.length > 0 
        ? state.loadingMessages 
        : DEFAULT_LOADING_MESSAGES;
        
      setCurrentLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);

      interval = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * messages.length);
        setCurrentLoadingMessage(messages[randomIndex]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, state.loadingMessages]);

  // Profile Completion State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempGender, setTempGender] = useState<Gender>('Male');
  const [tempOrientation, setTempOrientation] = useState<Orientation>('Heterosexual');

  // Character Fleshing Out State
  const [isFleshingOutCharacter, setIsFleshingOutCharacter] = useState(false);

  useEffect(() => {
    if (!state.playerProfile.name) {
      setShowProfileModal(true);
    }
  }, [state.playerProfile.name]);

  // Unified World Initialization: world topology + both character profiles in one request
  const [isGeneratingWorld, setIsGeneratingWorld] = useState(false);
  useEffect(() => {
    if (!state.worldData && state.worldview && !isGeneratingWorld) {
      setIsGeneratingWorld(true);
      setIsFleshingOutCharacter(true);
      (async () => {
        try {
          const result = await initializeWorld(
            state.worldview,
            state.playerProfile,
            state.companionProfile,
            state.language,
            state.worldviewUserInput
          );

          // Apply world data
          const spawnNode = result.worldData.nodes[0];
          const spawnHouse = spawnNode?.houses[0];
          if (spawnHouse) spawnHouse.safetyLevel = 'safe';
          const finalArtStyle = state.artStylePrompt || result.artStylePrompt;

          updateState({
            worldData: result.worldData,
            artStylePrompt: finalArtStyle,
            currentWorldId: result.worldData.id,
            currentNodeId: spawnNode?.id || null,
            currentHouseId: spawnHouse?.id || null,
            pacingState: { tensionLevel: 0, turnsInCurrentLevel: 0 },
            companionProfile: result.companionProfile,
            playerProfile: result.playerProfile,
            ...(typeof result.companionProfile.initialAffection === 'number'
              ? { affection: Math.max(0, Math.min(100, result.companionProfile.initialAffection)) }
              : {})
          });

          // Generate map image in background (non-blocking)
          generateMapImage(result.worldData, state.worldview, finalArtStyle).then(async base64 => {
            if (base64 && isAuthenticated && accessToken) {
              try {
                const fileName = `ai_rpg_map_${Date.now()}.png`;
                await uploadImageToDrive(accessToken, base64, fileName);
                updateState({ mapImageFileName: fileName });
              } catch (e) {
                console.error("Map image upload to Drive failed, discarding base64 to avoid bloating save", e);
                // 不写入 base64，下次打开地图时可重新生成
              }
            }
          }).catch(e => console.error("Map image generation failed", e));

          // Generate companion portrait in background (non-blocking)
          if (result.companionProfile.appearancePrompt && isAuthenticated && accessToken) {
            generateCharacterPortrait(result.companionProfile.appearancePrompt, state.worldview, finalArtStyle).then(async base64 => {
              if (base64 && accessToken) {
                try {
                  const fileName = `ai_rpg_portrait_${Date.now()}.png`;
                  await uploadImageToDrive(accessToken, base64, fileName);
                  updateState({ characterPortraitFileName: fileName });
                } catch (e) {
                  console.error("Portrait upload to Drive failed", e);
                }
              }
            }).catch(e => console.error("Portrait generation failed", e));
          }
        } catch (error) {
          console.error("Failed to initialize world", error);
          updateState({
            companionProfile: { ...state.companionProfile, isFleshedOut: true },
            playerProfile: { ...state.playerProfile, isFleshedOut: true },
          });
        } finally {
          worldProgressRef.current?.finish();
          characterProgressRef.current?.finish();
          setTimeout(() => {
            setIsGeneratingWorld(false);
            setIsFleshingOutCharacter(false);
          }, 600);
        }
      })();
    }
  }, [state.worldview, state.worldData]);

  useEffect(() => {
    const fetchMissingLoadingMessages = async () => {
      const isUsingDefaults = state.loadingMessages === DEFAULT_LOADING_MESSAGES || 
                              (state.loadingMessages.length > 0 && DEFAULT_LOADING_MESSAGES.includes(state.loadingMessages[0]));
      
      if (state.worldview && isUsingDefaults && !isProcessing) {
        try {
          const messages = await fetchCustomLoadingMessages(state.worldview, state.language);
          updateState({ loadingMessages: messages });
        } catch (error) {
          console.error("Failed to fetch background loading messages", error);
        }
      }
    };
    
    fetchMissingLoadingMessages();
  }, [state.worldview, state.loadingMessages.length]);

  const handleReconnectDrive = useCallback(async () => {
    setIsReconnecting(true);
    try {
      await reconnectDrive();
      setDriveToastDismissed(false);
    } finally {
      setIsReconnecting(false);
    }
  }, [reconnectDrive]);

  const handleProfileSubmit = () => {
    if (!tempName.trim()) return;
    updateState({
      playerProfile: {
        ...DEFAULT_PROFILE,
        name: tempName,
        gender: tempGender,
        orientation: tempOrientation,
      }
    });
    setShowProfileModal(false);
  };

  useEffect(() => {
    if (state.history.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: state.history.length - 1,
          align: 'end',
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [state.history.length]);

  const handleImageLoaded = useCallback((fileName: string, url: string) => {
    setImageUrls(prev => {
      if (prev[fileName]) return prev;
      return { ...prev, [fileName]: url };
    });
  }, []);

  const handleDeleteMessage = useCallback((index: number) => {
    const newHistory = [...state.history];
    if (index >= 0 && index < newHistory.length) {
      newHistory.splice(index, 1);
      const lastMessage = newHistory[newHistory.length - 1];
      
      let newPacingState = state.pacingState;
      if (lastMessage && lastMessage.pacingState) {
        newPacingState = lastMessage.pacingState;
      } else if (newHistory.length === 0) {
        newPacingState = INITIAL_STATE.pacingState;
      } else {
        newPacingState = { tensionLevel: 0, turnsInCurrentLevel: 0 };
      }

      const newHp = lastMessage?.hp ?? (newHistory.length === 0 ? INITIAL_STATE.hp : state.hp);
      const newInventory = lastMessage?.inventory ?? (newHistory.length === 0 ? INITIAL_STATE.inventory : state.inventory);
      const newStatus = lastMessage?.status ?? (newHistory.length === 0 ? INITIAL_STATE.status : state.status);

      updateState({ 
        history: newHistory,
        pacingState: newPacingState,
        hp: newHp,
        inventory: newInventory,
        status: newStatus
      });
    }
  }, [state.history, state.pacingState, state.hp, state.inventory, state.status, updateState]);

  const characterName = state.companionProfile.name || 'AI';

  const handleExportSave = useCallback(() => {
    const json = exportSave();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_rpg_save_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExportSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportSave]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // 点击菜单外部关闭‹⋯›菜单
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showMoreMenu]);

  const cycleTextSpeed = useCallback(() => {
    const order: TextSpeed[] = ['normal', 'fast', 'instant'];
    const idx = order.indexOf(textSpeed);
    setTextSpeed(order[(idx + 1) % order.length]);
  }, [textSpeed]);

  const speedLabel = textSpeed === 'normal' ? '1x' : textSpeed === 'fast' ? '2x' : '∞';

  return (
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 z-30 relative">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700 flex items-center justify-center shrink-0">
            {portraitUrl ? (
              <img src={portraitUrl} alt={characterName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-zinc-500 font-medium">{characterName[0]}</span>
            )}
          </div>
          <div>
            <h1 className="font-medium text-zinc-100">{characterName}</h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400">
                {state.pacingState.tensionLevel === 0 && "和平"}
                {state.pacingState.tensionLevel === 1 && "冒险"}
                {state.pacingState.tensionLevel === 2 && "冲突"}
                {state.pacingState.tensionLevel === 3 && "危机"}
                {state.pacingState.tensionLevel === 4 && "灾难"}
              </span>
              <div className="hidden sm:flex gap-0.5">
                {[0, 1, 2, 3, 4].map(level => (
                  <div 
                    key={level} 
                    className={`w-1.5 h-1.5 rounded-full ${
                      level <= state.pacingState.tensionLevel 
                        ? (level >= 3 ? 'bg-red-500' : level >= 1 ? 'bg-amber-500' : 'bg-emerald-500')
                        : 'bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
              <span className={`text-xs whitespace-nowrap ${state.hp <= 30 ? 'text-red-400' : state.hp <= 60 ? 'text-amber-400' : 'text-zinc-400'}`}>
                HP {state.hp}
              </span>
              <span className={`text-xs flex items-center gap-0.5 relative whitespace-nowrap ${state.affection >= 80 ? 'text-pink-400' : state.affection >= 60 ? 'text-rose-400' : state.affection >= 20 ? 'text-zinc-400' : 'text-zinc-600'}`}>
                <Heart className="w-3 h-3" fill={state.affection >= 60 ? 'currentColor' : 'none'} />
                {state.affection}
                <AnimatePresence>
                  {affectionDelta !== null && (
                    <motion.span
                      key={affectionAnimKey}
                      initial={{ opacity: 1, y: 0 }}
                      animate={{ opacity: 0, y: -18 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className={`absolute -top-1 left-full ml-1 text-xs font-bold whitespace-nowrap pointer-events-none ${affectionDelta > 0 ? 'text-pink-400' : 'text-blue-400'}`}
                    >
                      {affectionDelta > 0 ? `+${affectionDelta}` : affectionDelta}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {driveError ? (
            <button
              onClick={handleReconnectDrive}
              disabled={isReconnecting}
              className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>{isReconnecting ? '重连中...' : 'Drive 异常 · 点击重连'}</span>
            </button>
          ) : isAuthenticated ? (
            <div className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-1 sm:px-2 py-1 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="hidden sm:inline">Drive 已连接</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-1 sm:px-2 py-1 rounded-full border border-amber-500/20">
              <AlertCircle className="w-3 h-3" />
              <span className="hidden sm:inline">未连接 Drive</span>
            </div>
          )}

          {/* === PC: 所有按钮一字排开 === */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="relative group/vol">
              <button
                onClick={() => changeVolume(volume === 0 ? 0.5 : 0)}
                title={volume === 0 ? '取消静音' : '静音'}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
              >
                <VolumeIcon className="w-4 h-4 text-zinc-400" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 hidden group-hover/vol:block z-50">
                <div className="flex flex-col items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 shadow-xl">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={e => changeVolume(parseFloat(e.target.value))}
                    className="w-24 accent-zinc-400 cursor-pointer"
                  />
                  <span className="text-[10px] text-zinc-500 mt-1">{Math.round(volume * 100)}%</span>
                </div>
              </div>
            </div>
            <button
              onClick={cycleTextSpeed}
              title={`打字速度: ${speedLabel}`}
              className={`p-2 border rounded-full transition-colors ${
                textSpeed === 'normal'
                  ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'
                  : textSpeed === 'fast'
                  ? 'bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30'
              }`}
            >
              <div className="relative w-4 h-4 flex items-center justify-center">
                <ChevronsRight className={`w-4 h-4 ${
                  textSpeed === 'normal' ? 'text-zinc-400' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
                }`} />
                <span className={`absolute -top-1 -right-1.5 text-[8px] font-bold ${
                  textSpeed === 'normal' ? 'text-zinc-500' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
                }`}>{speedLabel}</span>
              </div>
            </button>
            <button
              onClick={() => navigate('/')}
              title="返回首页"
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <Home className="w-4 h-4 text-zinc-400" />
            </button>
            <button 
              onClick={handleExportSave}
              title="保存存档 (Ctrl+S)"
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <Save className="w-4 h-4 text-zinc-400" />
            </button>
            <button 
              onClick={() => setShowMap(true)}
              title="世界地图"
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <Map className="w-4 h-4 text-zinc-400" />
            </button>
            <button 
              onClick={() => setShowStatus(true)}
              title="背包与状态"
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <Backpack className="w-4 h-4 text-zinc-400" />
            </button>
          </div>

          {/* === 移动端: pinned 按钮 + ⋯ 菜单 === */}
          <div className="flex sm:hidden items-center gap-2">
            <button 
              onClick={() => setShowMap(true)}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <Map className="w-4 h-4 text-zinc-400" />
            </button>
            <button 
              onClick={() => setShowStatus(true)}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <Backpack className="w-4 h-4 text-zinc-400" />
            </button>
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(v => !v)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4 text-zinc-400" />
              </button>
              <AnimatePresence>
                {showMoreMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full right-0 mt-2 z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden min-w-[160px]"
                    >
                      <button
                        onClick={() => { cycleTextSpeed(); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-zinc-800 transition-colors text-sm text-zinc-300"
                      >
                        <ChevronsRight className={`w-4 h-4 ${
                          textSpeed === 'normal' ? 'text-zinc-400' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
                        }`} />
                        <span>打字速度 {speedLabel}</span>
                      </button>
                      <button
                        onClick={() => { navigate('/'); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-zinc-800 transition-colors text-sm text-zinc-300"
                      >
                        <Home className="w-4 h-4 text-zinc-400" />
                        <span>返回首页</span>
                      </button>
                      <button
                        onClick={() => { handleExportSave(); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-zinc-800 transition-colors text-sm text-zinc-300"
                      >
                        <Save className="w-4 h-4 text-zinc-400" />
                        <span>保存存档</span>
                      </button>
                      <div className="border-t border-zinc-800 px-4 py-3">
                        <div className="flex items-center gap-3 text-sm text-zinc-300 mb-2">
                          <VolumeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                          <span>音量 {Math.round(volume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={volume}
                          onChange={e => changeVolume(parseFloat(e.target.value))}
                          className="w-full accent-zinc-400 cursor-pointer"
                        />
                      </div>
                    </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Tracker */}
      <ProgressTracker state={state} />

      {/* Chat Area */}
      <div ref={chatAreaRef} className="flex-1 p-2 sm:p-4 space-y-2 sm:space-y-6 h-full overflow-hidden relative">
        {/* Large affection change animation overlay */}
        <AnimatePresence>
          {affectionDelta !== null && (
            <motion.div
              key={`big-aff-${affectionAnimKey}`}
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -30 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="absolute bottom-8 left-4 sm:left-28 z-20 pointer-events-none"
            >
              <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-0.5 backdrop-blur-md border ${
                affectionDelta > 0
                  ? 'bg-pink-500/15 border-pink-500/30'
                  : 'bg-blue-500/15 border-blue-500/30'
              }`}>
                <Heart
                  className={`w-7 h-7 ${affectionDelta > 0 ? 'text-pink-400' : 'text-blue-400'}`}
                  fill={affectionDelta > 0 ? 'currentColor' : 'none'}
                />
                <span className={`text-base font-bold ${affectionDelta > 0 ? 'text-pink-300' : 'text-blue-300'}`}>
                  {affectionDelta > 0 ? `+${affectionDelta}` : affectionDelta}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {state.currentObjective && (
            <FloatingObjective description={state.currentObjective.description} constraintsRef={chatAreaRef} />
          )}
        </AnimatePresence>
        <Virtuoso
          ref={virtuosoRef}
          data={state.history}
          initialTopMostItemIndex={state.history.length - 1}
          followOutput="smooth"
          context={{ onDelete: handleDeleteMessage, imageUrls, characterName, playerName: state.playerProfile.name || '你', onImageLoaded: handleImageLoaded, portraitUrl, totalMessages: state.history.length, textSpeed, flushPendingNotifications, animatedIds: animatedIdsRef.current }}
          itemContent={(index, msg, context) => {
            const isLast = index === context.totalMessages - 1;
            const isLastModel = msg.role === 'model' && isLast;
            // 只有未播放过动画的消息才触发打字动画
            const shouldAnimate = isLastModel && !context.animatedIds.has(msg.id);
            return (
              <div className="pb-6">
                <ChatMessageItem 
                  msg={msg} 
                  characterName={context.characterName}
                  playerName={context.playerName}
                  portraitUrl={context.portraitUrl}
                  imageUrl={msg.imageFileName ? context.imageUrls[msg.imageFileName] : undefined}
                  onImageLoaded={context.onImageLoaded}
                  onDelete={() => context.onDelete(index)}
                  animate={shouldAnimate}
                  textSpeed={context.textSpeed}
                  isLastModelMessage={isLastModel}
                  onTypewriterComplete={shouldAnimate ? () => {
                    context.animatedIds.add(msg.id);
                    context.flushPendingNotifications();
                  } : undefined}
                />
              </div>
            );
          }}
          components={{
            Footer: () => (
              isProcessing ? (
                <div className="flex w-full mx-auto pb-6 px-4 gap-3 justify-start">
                  <div className="w-20 h-20 rounded-xl bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700 flex items-center justify-center mt-5">
                    {portraitUrl ? (
                      <img src={portraitUrl} alt={characterName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-zinc-500 text-xs">{characterName[0]}</span>
                    )}
                  </div>
                  
                  <div className="flex flex-col max-w-[75%] items-start">
                    <div className="text-xs text-zinc-500 mb-1 px-1">
                      {characterName}
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm p-4 flex items-center gap-3 w-fit shadow-sm">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400 shrink-0" />
                      <AnimatePresence mode="wait">
                        <motion.span
                          key={currentLoadingMessage}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -5 }}
                          transition={{ duration: 0.2 }}
                          className="text-sm text-zinc-400 truncate"
                        >
                          {currentLoadingMessage}
                        </motion.span>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ) : null
            )
          }}
        />
      </div>

      <ChatInput isProcessing={isProcessing} onSend={handleTurn} />

      <AnimatePresence>
        {showStatus && (
          <StatusSidebar state={state} onClose={() => setShowStatus(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMap && (
          <MapOverlay state={state} onClose={() => setShowMap(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfileModal && (
          <ProfileModal
            tempName={tempName}
            setTempName={setTempName}
            tempGender={tempGender}
            setTempGender={setTempGender}
            tempOrientation={tempOrientation}
            setTempOrientation={setTempOrientation}
            onSubmit={handleProfileSubmit}
          />
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {isFleshingOutCharacter && <FleshingOutOverlay ref={characterProgressRef} />}
      </AnimatePresence>
      <AnimatePresence>
        {isGeneratingWorld && <FleshingOutOverlay ref={worldProgressRef} isWorld />}
      </AnimatePresence>

      <DebugOverlay state={state} onUpdateState={updateState} />

      <DriveToast
        visible={driveError && !driveToastDismissed}
        onDismiss={() => setDriveToastDismissed(true)}
        onReconnect={handleReconnectDrive}
      />
    </div>
  );
}
