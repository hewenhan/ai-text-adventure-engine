import { useState, useRef, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { generateSummary, generateTurn, generateImage, extractIntent, IMAGE_PROHIBITED_SENTINEL } from '../services/aiService';
import { uploadImageToDrive } from '../lib/drive';
import { D20Resolver } from '../lib/D20Resolver';
import {
  SUMMARY_THRESHOLD, KEEP_RECENT_TURNS, BGM_LIST,
  type GameState, type IntentResult, type NodeData, type HouseData
} from '../types/game';

// Helper to find the index of the Nth-to-last user message
const getStartIndexForRecentTurns = (messages: { role: string }[], turns: number) => {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      count++;
      if (count === turns) {
        return i;
      }
    }
  }
  return 0;
};

// ─── Spatial Helpers ───────────────────────────────────────────

function findNode(state: GameState, nodeId: string | null): NodeData | undefined {
  if (!nodeId || !state.worldData) return undefined;
  return state.worldData.nodes.find(n => n.id === nodeId);
}

function findHouse(node: NodeData | undefined, houseId: string | null): HouseData | undefined {
  if (!node || !houseId) return undefined;
  return node.houses.find(h => h.id === houseId);
}

function getVisibleHouses(node: NodeData, progressMap: Record<string, number>, currentObjective?: GameState['currentObjective']): HouseData[] {
  const nodeProgress = progressMap[`node_${node.id}`] || 0;
  return node.houses.filter((h, index) => {
    // 特权：如果是当前主线目标建筑，无视进度，直接揭盲可见
    const isTargetObjective = currentObjective?.targetHouseId === h.id;
    // 常规：依靠探索进度逐步揭盲
    const isRevealedByProgress = nodeProgress >= (index + 1) * 30;
    return isTargetObjective || isRevealedByProgress;
  });
}

function buildVisionContext(state: GameState): string {
  const currentNode = findNode(state, state.currentNodeId);
  if (!currentNode) return '未知区域';
  
  const visibleHouses = getVisibleHouses(currentNode, state.progressMap, state.currentObjective);
  const houseStr = visibleHouses.length > 0
    ? visibleHouses.map(h => `${h.name}(${h.type})`).join(', ')
    : '尚未发现可互动的建筑';

  const currentHouse = findHouse(currentNode, state.currentHouseId);
  const locationStr = currentHouse
    ? `当前位于: ${currentNode.name} → ${currentHouse.name}`
    : `当前位于: ${currentNode.name}(野外街区)`;

  return `${locationStr}. 已揭盲可互动的微观建筑: ${houseStr}`;
}

function getHpDescription(hp: number, language: 'zh' | 'en'): string {
  if (language === 'zh') {
    if (hp >= 80) return '健康无伤';
    if (hp >= 50) return '轻微擦伤';
    if (hp >= 30) return '受伤流血';
    return '重伤咳血，濒临倒下';
  }
  if (hp >= 80) return 'Healthy, no injuries';
  if (hp >= 50) return 'Minor scratches';
  if (hp >= 30) return 'Wounded, bleeding';
  return 'Critically wounded, on the verge of collapse';
}

// ─── D20 State Machine (moved to src/lib/D20Resolver.ts) ─────

// ─── Main Hook ────────────────────────────────────────────────

export function useChatLogic() {
  const { state, addMessage, updateState } = useGame();
  const { isAuthenticated, accessToken } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (state.history.length === 0 && !isProcessing && state.playerProfile && state.worldData && !hasInitialized.current) {
      hasInitialized.current = true;
      handleTurn("你好"); // Trigger initial flow
    }
  }, [state.playerProfile, state.worldData, state.history.length, isProcessing]);

  const handleTurn = async (userInput: string) => {
    if (!state.playerProfile) return false;
    if (state.isGameOver) return false;
    if (!state.worldData || !state.currentNodeId) return false;

    setIsProcessing(true);

    const userMsgId = uuidv4();
    addMessage({
      id: userMsgId,
      role: 'user',
      text: userInput,
      timestamp: Date.now(),
    });

    try {
      // ── Summary maintenance ──
      let currentSummary = state.summary;
      let turnsCount = state.turnsSinceLastSummary + 1;

      const isLongHistoryWithoutSummary = state.summary === "" && state.history.filter(m => m.role === 'user').length > (SUMMARY_THRESHOLD + KEEP_RECENT_TURNS);

      if (turnsCount >= SUMMARY_THRESHOLD || isLongHistoryWithoutSummary) {
        const allMessages = [...state.history, { role: 'user', text: userInput } as const];
        const recentStartIndex = getStartIndexForRecentTurns(allMessages, KEEP_RECENT_TURNS);
        
        if (recentStartIndex > 0) {
          const messagesToSummarize = allMessages.slice(0, recentStartIndex);
          const newSummary = await generateSummary(currentSummary, messagesToSummarize as any, state.language);
          if (newSummary) {
            currentSummary = newSummary;
            turnsCount = 0;
            updateState({ summary: currentSummary, turnsSinceLastSummary: 0 });
          }
        }
      } else {
        updateState({ turnsSinceLastSummary: turnsCount });
      }

      // ── Step 1: Intent Extraction ──
      const currentNode = findNode(state, state.currentNodeId)!;
      const visionContext = buildVisionContext(state);

      // 组装带名称和类型的连接节点信息
      const connectedNodesInfo = currentNode.connections.map(connId => {
        const connNode = state.worldData!.nodes.find(n => n.id === connId);
        return connNode ? `${connId} (${connNode.name} - ${connNode.type})` : connId;
      }).join(', ');

      // 组装已揭盲建筑信息
      const visibleHousesList = getVisibleHouses(currentNode, state.progressMap, state.currentObjective);
      const visibleHousesInfo = visibleHousesList.length > 0
        ? visibleHousesList.map(h => `${h.id} (${h.name} - ${h.type})`).join(', ')
        : 'None';

      const intent = await extractIntent(
        userInput,
        state.currentNodeId!,
        state.currentHouseId,
        visionContext,
        connectedNodesInfo,
        visibleHousesInfo,
        state.currentObjective?.description || null,
        state.language
      );

      console.log("Intent:", intent);

      // ── Step 1.5: Director Interceptor (seek_quest) ──
      let directorNarrativeOverride: string | null = null;
      if (intent.intent === 'seek_quest') {
        if (state.currentObjective !== null) {
          // 分支 A：玩家已有目标却在瞎折腾
          directorNarrativeOverride = `【系统强制】：玩家当前已有明确主线任务（${state.currentObjective.description}），却漫无目的或提出去别的无关地点。请伴游 NPC 立刻严厉打断玩家，提醒玩家不要节外生枝，赶紧打开地图寻找前往目标的路线！`;
        } else {
          // 分支 B：玩家确实没有目标，TS 充当发牌员
          const availableNodes = state.worldData!.nodes.filter(n => n.id !== state.currentNodeId && n.houses.length > 0);
          if (availableNodes.length > 0) {
            const targetNode = availableNodes[Math.floor(Math.random() * availableNodes.length)];
            const targetHouse = targetNode.houses[Math.floor(Math.random() * targetNode.houses.length)];

            const newObjective = {
              targetNodeId: targetNode.id,
              targetHouseId: targetHouse.id,
              description: `前往【${targetNode.name}】调查【${targetHouse.name}】`
            };
            updateState({ currentObjective: newObjective });

            directorNarrativeOverride = `【系统强制派发任务】：玩家目前漫无目的。请伴游 NPC 立刻抛出一个极其紧急的新目标：极力劝说玩家前往【${targetNode.name}】寻找【${targetHouse.name}】(这是一个 ${targetHouse.type} 类型的建筑)。\n请你根据该建筑的类型，现场编造一个极其合理的动机（例如：NPC 截获了求救信号、或者想起那里藏有关乎性命的物资）。绝不要提玩家刚才瞎编的地点！敦促玩家看地图找路过去！`;
          }
        }
      }

      if (intent.intent === 'explore' && state.pacingState.tensionLevel === 0) {
        state.pacingState.tensionLevel = 1; // Force escalate to Tension 1 if trying to explore in safe zone  
      }

      // ── Step 2: D20 State Machine Resolution ──
      const d20 = Math.floor(Math.random() * 20) + 1;
      const resolution = D20Resolver.resolve(state, intent, d20);

      // 如果导演系统有叙事覆盖，替换 resolution 的 narrativeInstruction
      if (directorNarrativeOverride) {
        resolution.narrativeInstruction = directorNarrativeOverride;
      }

      console.log("D20 Roll:", d20, "Resolution:", resolution);

      // ── Apply state changes from resolution ──
      const prevTension = state.pacingState.tensionLevel;
      const tensionChanged = resolution.newTensionLevel !== prevTension;

      updateState(prev => ({
        hp: resolution.newHp,
        lives: resolution.newLives,
        isGameOver: resolution.newIsGameOver,
        inventory: resolution.newInventory,
        currentNodeId: resolution.newNodeId,
        currentHouseId: resolution.newHouseId,
        transitState: resolution.newTransitState,
        progressMap: resolution.newProgressMap,
        pacingState: {
          tensionLevel: resolution.newTensionLevel,
          turnsInCurrentLevel: tensionChanged ? 1 : (prev.pacingState.turnsInCurrentLevel + 1)
        }
      }));

      // ── Build recent history text ──
      const allMessagesForPrompt = [...state.history, { role: 'user', text: userInput } as const];
      const promptStartIndex = getStartIndexForRecentTurns(allMessagesForPrompt, KEEP_RECENT_TURNS);
      const recentHistory = allMessagesForPrompt.slice(promptStartIndex);
      const historyText = recentHistory.map(m => `${m.role}: ${m.text}`).join('\n');
      const lastVisuals = [...state.history].reverse().find(m => m.currentSceneVisuals)?.currentSceneVisuals || 'None yet';

      // ── Build FOV-injected vision context with updated state ──
      // Phase 2: 构建位置上下文，区分赶路/室内/野外
      let locationContext = '';
      if (resolution.newTransitState) {
        const fromNode = findNode(state, resolution.newTransitState.fromNodeId);
        const toNode = findNode(state, resolution.newTransitState.toNodeId);
        locationContext = `【当前位置】：荒野旅途。正在从【${fromNode?.name || resolution.newTransitState.fromNodeId}】徒步赶往【${toNode?.name || resolution.newTransitState.toNodeId}】的路上。(当前路程进度：${resolution.newTransitState.pathProgress}%)。请侧重描写沿途的风景、路况或遭遇的危险，不要提及任何具体的建筑内部。`;
      } else {
        const updatedNode = findNode(state, resolution.newNodeId);
        if (updatedNode) {
          const visHouses = getVisibleHouses(updatedNode, resolution.newProgressMap, state.currentObjective);
          const hStr = visHouses.length > 0
            ? visHouses.map(h => `${h.name}(${h.type})`).join(', ')
            : '尚未发现可互动的建筑';
          const updatedHouse = findHouse(updatedNode, resolution.newHouseId);
          if (updatedHouse) {
            locationContext = `【当前位置】：室内搜刮。当前正位于【${updatedNode.name}】的微观建筑【${updatedHouse.name}】内部。已揭盲可互动的微观建筑: ${hStr}。请侧重描写室内的空间感、物资或幽闭的环境。`;
          } else {
            locationContext = `【当前位置】：街区/野外。正处于【${updatedNode.name}】的宏观区域。已揭盲可互动的微观建筑: ${hStr}。可看到周围的建筑。`;
          }
        } else {
          locationContext = `【当前位置】：${visionContext}`;
        }
      }

      // Phase 3: 室内/室外双轨进度防混淆
      const activeProgressKey = resolution.newHouseId
        ? `house_${resolution.newHouseId}`
        : (resolution.newTransitState ? 'transit' : `node_${resolution.newNodeId}`);

      const currentProgress = resolution.newTransitState
        ? resolution.newTransitState.pathProgress
        : (resolution.newProgressMap[activeProgressKey] || 0);

      const progressLabel = resolution.newTransitState
        ? `当前徒步赶路进度: ${currentProgress}%`
        : (resolution.newHouseId ? `当前室内搜刮进度: ${currentProgress}%` : `当前区域建筑发现进度: ${currentProgress}%`);

      const characterRoleString = `Name: ${state.characterSettings.name}\nGender: ${state.characterSettings.gender}\nDescription: ${state.characterSettings.description}\nPersonality: ${state.characterSettings.personality}\nBackground: ${state.characterSettings.background}\nHobbies: ${state.characterSettings.hobbies}`;

      // ── Module 5: Assemble LLM Prompt (Story Renderer Only) ──
      const systemPrompt = `你是本游戏的沉浸式多模态图文渲染引擎。你**没有**判定胜负的权力，只需根据以下【既定事实】进行生动描写。

角色设定：
${characterRoleString}

世界观: ${state.worldview}

玩家档案:
姓名: ${state.playerProfile!.name}
性别: ${state.playerProfile!.gender}
性取向: ${state.playerProfile!.orientation}

当前状态参数：
- 绝对位置与可用视野：${locationContext}
- 健康状态：${getHpDescription(resolution.newHp, state.language)}（HP: ${resolution.newHp}/100）
- ${progressLabel}（【揭盲锁】：未满100%绝不可描写彻底探索完毕！）
- 紧张等级: ${resolution.newTensionLevel}（0=和平, 1=探索, 2=冲突, 3=危机, 4=死斗）

上一场景视觉: "${lastVisuals}"

故事摘要: "${currentSummary}"

CORE RULES:
1. **TONE & RELATIONSHIP**: 
   - 你是玩家的同伴角色（不是向导或指挥官）。自然、人性、有情感。
   - 根据玩家性别/性取向与你的角色性别决定互动模式（慢热恋爱/纯友谊）。
   - 不要用第一人称叙事，用纯对话和音效传达动作。

2. **FORMAT & CONCISENESS (CRITICAL)**:
   - 5-7段对话，其中3-4段极短（<10字），最多1段可稍长。
   - 节奏呈现锯齿感: 短→短→中→短。最后一段必须是问题/指令/反应。

3. **NARRATIVE VARIETY**: 
   - 避免陈词滥调，多样化威胁类型，不重复近期已有的事件模式。
   - SHOW DON'T TELL：描写具体感官细节（气味、温度、声音）。

4. **VISUAL CONSISTENCY**: 
   - 如仍在同一地点，复用之前的视觉细节。
   - 若到新地点，在scene_visuals_update中提供新描述。

5. **LANGUAGE**: 你必须用${state.language === 'zh' ? '中文' : 'English'}回复。

本次检定的既定事实 (Required Outcome) - 极其重要：
${resolution.narrativeInstruction}

**严格按照上述指令的走向描写，不可扭转胜负。**

OUTPUT FORMAT (JSON ONLY):
{
  "image_prompt": "A detailed, first-person view description for image generation...",
  "text_sequence": ["segment1", "segment2", ...],
  "scene_visuals_update": "仅在进入新地点时提供，否则省略"
}

不需要返回任何状态数值 update（全部数据状态已在系统后台静默变更完毕）。`;

      const fullPrompt = `${systemPrompt}\n\nRecent Chat History:\n${historyText}\n\nUser Action: ${userInput}`;

      // console.log(fullPrompt);

      // ── Call LLM for story rendering ──
      const responseJson = await generateTurn(fullPrompt);
      // console.log("AI Response JSON:", responseJson);
      const { image_prompt, text_sequence, scene_visuals_update } = responseJson;
      
      const messages = Array.isArray(text_sequence) ? text_sequence : [responseJson.text_response || "......"];

      const newDebugState = {
        lastActionRoll: d20,
        lastSuccessThreshold: 0, // No longer threshold-based per se
        lastIsSuccess: resolution.isSuccess,
        lastTensionLevel: state.pacingState.tensionLevel,
        lastIntent: intent.intent,
        lastNarrativeInstruction: resolution.narrativeInstruction,
        lastImagePrompt: image_prompt,
        lastImageError: undefined as string | undefined
      };

      // ── BGM selection ── 
      let selectedBgmKey: string | undefined;
      if (tensionChanged) {
        const bgmCandidates = BGM_LIST[resolution.newTensionLevel as keyof typeof BGM_LIST] || [];
        selectedBgmKey = bgmCandidates.length > 0
          ? bgmCandidates[Math.floor(Math.random() * bgmCandidates.length)]
          : undefined;
      } else {
        for (let i = state.history.length - 1; i >= 0; i--) {
          if (state.history[i].bgmKey) { selectedBgmKey = state.history[i].bgmKey; break; }
        }
      }
      // Fallback: if still no BGM (e.g. first turn, empty history), pick one for current tension
      if (!selectedBgmKey) {
        const bgmFallback = BGM_LIST[resolution.newTensionLevel as keyof typeof BGM_LIST] || [];
        selectedBgmKey = bgmFallback.length > 0
          ? bgmFallback[Math.floor(Math.random() * bgmFallback.length)]
          : undefined;
      }

      // ── Image generation ──
      let imagePromise: Promise<string | undefined> = Promise.resolve(undefined);
      
      if (image_prompt && isAuthenticated && accessToken) {
        imagePromise = (async () => {
          try {
            const base64Data = await generateImage(image_prompt);
            if (base64Data === IMAGE_PROHIBITED_SENTINEL) {
              newDebugState.lastImageError = 'PROHIBITED_CONTENT';
              return IMAGE_PROHIBITED_SENTINEL;
            }
            if (base64Data) {
              const fileName = `ai_rpg_${Date.now()}.png`;
              await uploadImageToDrive(accessToken, base64Data, fileName);
              return fileName;
            }
          } catch (e) {
            console.error("Image generation/upload failed", e);
            newDebugState.lastImageError = e instanceof Error ? e.message : String(e);
          }
          return undefined;
        })();
      }

      // ── Display messages with typing delays ──
      const WORDS_PER_SECOND = 6;
      const calculateDelay = (text: string) => {
        const delay = (text.length / WORDS_PER_SECOND) * 1000;
        return Math.max(1000, delay);
      };

      const displayMessages = async () => {
        let lastMsgId = uuidv4();
        
        addMessage({
          id: lastMsgId,
          role: 'model',
          text: messages[0],
          timestamp: Date.now(),
          debugState: newDebugState,
          currentSceneVisuals: scene_visuals_update || lastVisuals,
          bgmKey: selectedBgmKey
        });

        if (messages.length === 1) {
          const fileName = await imagePromise;
          if (fileName) {
            updateState(prev => ({
              history: prev.history.map(m => 
                m.id === lastMsgId ? { ...m, imageFileName: fileName } : m
              )
            }));
          }
          setIsProcessing(false);
          return;
        }

        for (let i = 1; i < messages.length - 1; i++) {
          const delay = calculateDelay(messages[i - 1]);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          lastMsgId = uuidv4();
          addMessage({
            id: lastMsgId,
            role: 'model',
            text: messages[i],
            timestamp: Date.now() + i,
            bgmKey: selectedBgmKey
          });
        }

        const lastDelay = calculateDelay(messages[messages.length - 2]);
        const [fileName] = await Promise.all([
          imagePromise,
          new Promise(resolve => setTimeout(resolve, lastDelay))
        ]);

        lastMsgId = uuidv4();
        addMessage({
          id: lastMsgId,
          role: 'model',
          text: messages[messages.length - 1],
          timestamp: Date.now() + messages.length - 1,
          imageFileName: fileName,
          bgmKey: selectedBgmKey
        });

        setIsProcessing(false);
      };

      displayMessages();

    } catch (error) {
      console.error("Failed to process turn", error);
      addMessage({
        id: uuidv4(),
        role: 'model',
        text: "（系统错误：无法生成回复，请重试）",
        timestamp: Date.now()
      });
      setIsProcessing(false);
    }
    return true;
  };

  return {
    isProcessing,
    handleTurn
  };
}
