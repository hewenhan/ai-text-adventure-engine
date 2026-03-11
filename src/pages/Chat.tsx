import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Backpack, Loader2, Map, RefreshCw, Save } from 'lucide-react';
import { PlayerProfile, DEFAULT_LOADING_MESSAGES, INITIAL_STATE } from '../types/game';
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
import { fleshOutCharacterProfile, fetchCustomLoadingMessages, generateWorldData, generateMapImage, generateCharacterPortrait } from '../services/aiService';

export default function Chat() {
  const { state, updateState, exportSave } = useGame();
  const { isAuthenticated, driveError, reconnectDrive, accessToken } = useAuth();
  const [showStatus, setShowStatus] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [textSpeed, setTextSpeed] = useState<TextSpeed>('normal');
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [driveToastDismissed, setDriveToastDismissed] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  
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
  const [tempGender, setTempGender] = useState<PlayerProfile['gender']>('Male');
  const [tempOrientation, setTempOrientation] = useState<PlayerProfile['orientation']>('Heterosexual');

  // Character Fleshing Out State
  const [isFleshingOutCharacter, setIsFleshingOutCharacter] = useState(false);

  useEffect(() => {
    if (!state.playerProfile) {
      setShowProfileModal(true);
    }
  }, [state.playerProfile]);

  useEffect(() => {
    const fleshOutCharacter = async () => {
      const needsFleshingOut = !state.characterSettings.isFleshedOut;

      if (needsFleshingOut && state.worldview && !isFleshingOutCharacter) {
        setIsFleshingOutCharacter(true);
        try {
          const profile = await fleshOutCharacterProfile(
            state.worldview,
            state.characterSettings.name,
            state.characterSettings.gender,
            state.characterSettings.description,
            state.language
          );
          
          updateState({ 
            characterSettings: {
              ...profile,
              isFleshedOut: true
            }
          });

          // 生成角色证件照并上传到 Drive
          if (profile.appearancePrompt && isAuthenticated && accessToken) {
            generateCharacterPortrait(profile.appearancePrompt, state.worldview, state.artStylePrompt).then(async base64 => {
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
          console.error("Failed to flesh out character", error);
          updateState({
            characterSettings: {
              ...state.characterSettings,
              isFleshedOut: true
            }
          });
        } finally {
          characterProgressRef.current?.finish();
          setTimeout(() => setIsFleshingOutCharacter(false), 600);
        }
      }
    };

    fleshOutCharacter();
  }, [state.characterSettings, state.worldview]);

  // World Data Generation: generate topology map if not present
  const [isGeneratingWorld, setIsGeneratingWorld] = useState(false);
  useEffect(() => {
    const generateWorld = async () => {
      if (!state.worldData && state.worldview && !isGeneratingWorld) {
        setIsGeneratingWorld(true);
        try {
          const { worldData, artStylePrompt: aiGeneratedStyle } = await generateWorldData(state.worldview, state.language, state.worldviewUserInput);
          // Spawn Rule: player starts in first node's first house, force it safe
          const spawnNode = worldData.nodes[0];
          const spawnHouse = spawnNode?.houses[0];
          if (spawnHouse) {
            spawnHouse.safetyLevel = 'safe';
          }
          // 如果用户已选择了固定风格提词（非系统推荐），保留用户的选择
          const finalArtStyle = state.artStylePrompt || aiGeneratedStyle;
          updateState({
            worldData,
            artStylePrompt: finalArtStyle,
            currentWorldId: worldData.id,
            currentNodeId: spawnNode?.id || null,
            currentHouseId: spawnHouse?.id || null,
            pacingState: { tensionLevel: 0, turnsInCurrentLevel: 0 }
          });

          // Generate map image in background (non-blocking), upload to Drive
          generateMapImage(worldData, state.worldview, finalArtStyle).then(async base64 => {
            if (base64) {
              if (isAuthenticated && accessToken) {
                try {
                  const fileName = `ai_rpg_map_${Date.now()}.png`;
                  await uploadImageToDrive(accessToken, base64, fileName);
                  updateState({ mapImageFileName: fileName });
                } catch (e) {
                  console.error("Map image upload to Drive failed", e);
                  // Fallback: store as data URL
                  updateState({ mapImageFileName: `data:image/png;base64,${base64}` });
                }
              } else {
                // No Drive auth, fallback to data URL
                updateState({ mapImageFileName: `data:image/png;base64,${base64}` });
              }
            }
          }).catch(e => console.error("Map image generation failed", e));
        } catch (error) {
          console.error("Failed to generate world data", error);
        } finally {
          worldProgressRef.current?.finish();
          setTimeout(() => setIsGeneratingWorld(false), 600);
        }
      }
    };
    generateWorld();
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
        name: tempName,
        gender: tempGender,
        orientation: tempOrientation
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

  const characterName = state.characterSettings.name || 'AI';

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

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700 flex items-center justify-center">
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
              <div className="flex gap-0.5">
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
              <span className={`text-xs ${state.hp <= 30 ? 'text-red-400' : state.hp <= 60 ? 'text-amber-400' : 'text-zinc-400'}`}>
                HP {state.hp}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Drive 已连接</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full border border-amber-500/20">
              <AlertCircle className="w-3 h-3" />
              <span>未连接 Drive</span>
            </div>
          )}
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
      </div>

      {/* Progress Tracker */}
      <ProgressTracker state={state} />

      {/* Chat Area */}
      <div className="flex-1 p-4 space-y-6 h-full overflow-hidden relative">
        <AnimatePresence>
          {state.currentObjective && (
            <FloatingObjective description={state.currentObjective.description} />
          )}
        </AnimatePresence>
        <Virtuoso
          ref={virtuosoRef}
          data={state.history}
          initialTopMostItemIndex={state.history.length - 1}
          followOutput="smooth"
          context={{ onDelete: handleDeleteMessage, imageUrls, characterName, onImageLoaded: handleImageLoaded, portraitUrl, totalMessages: state.history.length, textSpeed, flushPendingNotifications, animatedIds: animatedIdsRef.current }}
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

      <ChatInput isProcessing={isProcessing} onSend={handleTurn} volume={volume} onVolumeChange={changeVolume} textSpeed={textSpeed} onTextSpeedChange={setTextSpeed} />

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

      <DebugOverlay state={state} />

      <DriveToast
        visible={driveError && !driveToastDismissed}
        onDismiss={() => setDriveToastDismissed(true)}
        onReconnect={handleReconnectDrive}
      />
    </div>
  );
}
