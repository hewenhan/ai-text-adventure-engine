import { useState, useRef, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { generateSummary, generateTurn, generateImage, extractIntent } from '../services/aiService';
import { uploadImageToDrive } from '../lib/drive';
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

function getVisibleHouses(node: NodeData, progressMap: Record<string, number>): HouseData[] {
  const nodeProgress = progressMap[`node_${node.id}`] || 0;
  // Reveal houses based on progress: every 30% reveals one more house
  return node.houses.filter((_h, index) => nodeProgress >= (index + 1) * 30);
}

function buildVisionContext(state: GameState): string {
  const currentNode = findNode(state, state.currentNodeId);
  if (!currentNode) return '未知区域';
  
  const visibleHouses = getVisibleHouses(currentNode, state.progressMap);
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

// ─── D20 State Machine ────────────────────────────────────────

interface TurnResolution {
  newHp: number;
  newLives: number;
  newTensionLevel: 0 | 1 | 2 | 3 | 4;
  newNodeId: string | null;
  newHouseId: string | null;
  newProgressMap: Record<string, number>;
  newInventory: string[];
  newIsGameOver: boolean;
  narrativeInstruction: string;
  roll: number;
  isSuccess: boolean;
}

function resolveD20(
  state: GameState,
  intent: IntentResult,
  roll: number
): TurnResolution {
  const res: TurnResolution = {
    newHp: state.hp,
    newLives: state.lives,
    newTensionLevel: state.pacingState.tensionLevel,
    newNodeId: state.currentNodeId,
    newHouseId: state.currentHouseId,
    newProgressMap: { ...state.progressMap },
    newInventory: [...state.inventory],
    newIsGameOver: false,
    narrativeInstruction: '',
    roll,
    isSuccess: false,
  };

  const tension = state.pacingState.tensionLevel;
  const currentNode = findNode(state, state.currentNodeId);

  // ─── Tension 0 (Safe zone / Spawn default) ─────
  if (tension === 0) {
    if (intent.intent === 'move') {
      // Leave safe zone → forced to Tension 1
      const targetId = intent.targetId;
      if (targetId && currentNode?.connections.includes(targetId)) {
        res.newNodeId = targetId;
        res.newHouseId = null;
        res.newTensionLevel = 1;
        res.narrativeInstruction = '【系统指令】：玩家离开安全区域，踏入未知。当前紧张度升至1级（探索推进）。请描写离开安全屋，踏入外部世界的场景。';
      } else {
        res.narrativeInstruction = '【系统指令】：玩家尝试移动但目标位置不可达。请描写路被阻断或找不到出路的场景。';
      }
      res.isSuccess = true;
    } else {
      // idle / explore in safe zone → pure rest, recover HP
      const hpRecovery = Math.min(100, res.newHp + 5);
      res.newHp = hpRecovery;
      res.narrativeInstruction = '【系统指令】：安全区域，无威胁。玩家正在休整，略有恢复。请描写平静的休息/对话/环境氛围。';
      res.isSuccess = true;
    }
    return applyDeathHook(res);
  }

  // ─── Tension 1 (Exploration / Progress accumulation) ─────
  if (tension === 1) {
    if (intent.intent === 'explore') {
      const progressKey = state.currentHouseId
        ? `house_${state.currentHouseId}`
        : `node_${state.currentNodeId}`;

      if (roll >= 1 && roll <= 3) {
        // Accident → 0 progress, escalate to Tension 2
        res.newTensionLevel = 2;
        res.isSuccess = false;
        res.narrativeInstruction = `【系统指令 - 大失败】：探索遭遇意外伏击/陷阱！进度+0，紧张度强制升至2级（冲突）。Roll=${roll}，请描写突如其来的危机。`;
      } else if (roll >= 4 && roll <= 16) {
        // Smooth → +15 progress
        res.newProgressMap[progressKey] = Math.min(100, (res.newProgressMap[progressKey] || 0) + 15);
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令 - 成功】：探索顺利推进，进度+15（当前${res.newProgressMap[progressKey]}%）。Roll=${roll}，请描写发现线索/安全前进的场景。`;
      } else {
        // Lucky find → +40 progress
        res.newProgressMap[progressKey] = Math.min(100, (res.newProgressMap[progressKey] || 0) + 40);
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令 - 奇遇】：探索发现隐藏物资！进度+40（当前${res.newProgressMap[progressKey]}%）。Roll=${roll}，请描写意外发现珍贵资源或隐藏通道的场景。`;
      }
    } else if (intent.intent === 'move') {
      // Move in Tension 1: auto-success if connected
      const targetId = intent.targetId;
      if (targetId && currentNode?.connections.includes(targetId)) {
        res.newNodeId = targetId;
        res.newHouseId = null;
        res.isSuccess = true;
        res.narrativeInstruction = '【系统指令】：移动成功，玩家转移至新区域。请描写旅途与抵达新地点的见闻。';
      } else if (targetId && currentNode) {
        // Check if target is a house within current node
        const visibleHouses = getVisibleHouses(currentNode, state.progressMap);
        const targetHouse = visibleHouses.find(h => h.id === targetId);
        if (targetHouse) {
          res.newHouseId = targetId;
          res.isSuccess = true;
          res.narrativeInstruction = `【系统指令】：玩家进入${targetHouse.name}。请描写进入该建筑的场景。`;
        } else {
          res.isSuccess = false;
          res.narrativeInstruction = '【系统指令】：目标位置未揭盲或不可达。请描写找不到出路的场景。';
        }
      } else {
        // No target: go to node outdoor if in house
        if (state.currentHouseId) {
          res.newHouseId = null;
          res.isSuccess = true;
          res.narrativeInstruction = '【系统指令】：玩家退出当前建筑，回到街区野外。请描写走出建筑的场景。';
        } else {
          res.isSuccess = false;
          res.narrativeInstruction = '【系统指令】：玩家想移动但未指定明确方向。请询问玩家要去哪里。';
        }
      }
    } else if (intent.intent === 'idle') {
      // Rest in Tension 1 – might drop to 0
      res.newTensionLevel = 0;
      res.isSuccess = true;
      res.narrativeInstruction = '【系统指令】：玩家选择休息/社交，紧张度降至0级（和平）。请描写放松的氛围。';
    } else {
      // combat in T1: treat as explore
      res.isSuccess = roll >= 5;
      res.narrativeInstruction = res.isSuccess
        ? `【系统指令 - 成功】：玩家战斗成功。Roll=${roll}，请描写化解威胁的过程。`
        : `【系统指令 - 失败】：玩家战斗失败，紧张度升至2级。Roll=${roll}，请描写战斗挫折。`;
      if (!res.isSuccess) res.newTensionLevel = 2;
    }
    return applyMilestoneHook(applyDeathHook(res), state);
  }

  // ─── Tension 2 & 3 (Conflict / Crisis) ─────
  if (tension === 2 || tension === 3) {
    if (intent.intent === 'move') {
      // Tactical retreat: free, no damage, drop to T1
      // Find the previous safe node or just back to outdoor
      const previousNodeId = findSafeRetreatNode(state);
      res.newNodeId = previousNodeId || state.currentNodeId;
      res.newHouseId = null;
      res.newTensionLevel = 1;
      res.isSuccess = true;
      res.narrativeInstruction = '【系统指令 - 战术撤退】：玩家放弃探索，有序撤出。无伤脱战，紧张度降至1级。请描写安全撤离的过程。';
    } else if (intent.intent === 'combat') {
      if (roll >= 1 && roll <= 4) {
        // Failure: take damage, escalate
        res.newHp -= 15;
        res.newTensionLevel = Math.min(4, tension + 1) as 0 | 1 | 2 | 3 | 4;
        res.isSuccess = false;
        res.narrativeInstruction = `【系统指令 - 战斗失败】：遭受重击，HP-15（当前${res.newHp}），紧张度升至${res.newTensionLevel}级。Roll=${roll}，请描写被压制/受伤的惨烈场面。`;
      } else if (roll >= 5 && roll <= 16) {
        // Victory: drop to T1
        res.newTensionLevel = 1;
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令 - 战斗胜利】：威胁被击退！紧张度降至1级（恢复期）。Roll=${roll}，请描写击退敌人后的喘息。`;
      } else {
        // Critical hit: drop to T1
        res.newTensionLevel = 1;
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令 - 秒杀】：一击必杀！紧张度降至1级。Roll=${roll}，请描写干净利落的致命一击。`;
      }
    } else {
      // idle/explore in combat situation: risky, treated as partial combat
      if (roll >= 10) {
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令】：在危机中尝试非战斗行动，侥幸成功。Roll=${roll}，请描写惊险一幕。`;
      } else {
        res.newHp -= 10;
        res.isSuccess = false;
        res.narrativeInstruction = `【系统指令】：在危机中分心，遭到攻击！HP-10（当前${res.newHp}）。Roll=${roll}，请描写因分心而受伤。`;
      }
    }
    return applyMilestoneHook(applyDeathHook(res), state);
  }

  // ─── Tension 4 (Boss / Death-lock) ─────
  if (tension === 4) {
    if (intent.intent === 'move') {
      // Cannot flee! Treated as combat mega-fail
      res.newHp -= 30;
      res.isSuccess = false;
      res.narrativeInstruction = `【系统指令 - 逃跑失败】：死斗封锁！无法逃离！背对敌人遭受重击，HP-30（当前${res.newHp}）。请描写逃跑被阻止并遭受重创的绝望场面。`;
    } else if (intent.intent === 'combat') {
      if (roll >= 1 && roll <= 8) {
        // Heavy wound, stay T4
        res.newHp -= 40;
        res.isSuccess = false;
        res.narrativeInstruction = `【系统指令 - 重伤】：被首领重创！HP-40（当前${res.newHp}），死斗继续。Roll=${roll}，请描写被首领压制的绝境。`;
      } else if (roll >= 9 && roll <= 18) {
        // Heroic struggle, stay T4
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令 - 拉锯战】：与首领势均力敌！死斗继续。Roll=${roll}，请描写英勇交锋的激烈场面。`;
      } else {
        // Critical kill! Drop to T0
        res.newTensionLevel = 0;
        res.isSuccess = true;
        res.narrativeInstruction = `【系统指令 - 英雄斩杀】：致命一击！首领倒下！紧张度骤降至0级（胜利庆祝）。Roll=${roll}，请描写史诗级的最终一击与胜利的欢呼。`;
      }
    } else {
      // idle/explore in T4: very bad idea
      res.newHp -= 20;
      res.isSuccess = false;
      res.narrativeInstruction = `【系统指令 - 致命疏忽】：在死斗中发呆！被首领重击，HP-20（当前${res.newHp}）。Roll=${roll}，请描写因为分神而遭受猛击。`;
    }
    return applyDeathHook(res);
  }

  return res;
}

// ─── Interceptor Hooks ────────────────────────────────────────

function applyDeathHook(res: TurnResolution): TurnResolution {
  if (res.newHp <= 0) {
    if (res.newLives > 0) {
      res.newLives -= 1;
      res.newHp = 20;
      res.newTensionLevel = 1;
      res.narrativeInstruction = `【系统强制】：致命伤！主角消耗复活币锁血（剩余${res.newLives}条命）。拖着残躯狼狈逃离，苟延残喘。` + res.narrativeInstruction;
    } else {
      res.newIsGameOver = true;
      res.newHp = 0;
      res.narrativeInstruction = '【系统强制】：生命值归零，彻底陨落。请撰写主角死亡的悲壮结局。';
    }
  }
  return res;
}

function applyMilestoneHook(res: TurnResolution, state: GameState): TurnResolution {
  // Check if any progress just hit 100 while in T1
  if (res.newTensionLevel !== 1) return res;

  const checkKey = state.currentHouseId
    ? `house_${state.currentHouseId}`
    : `node_${state.currentNodeId}`;
  
  const progress = res.newProgressMap[checkKey] || 0;
  const oldProgress = state.progressMap[checkKey] || 0;
  
  if (progress >= 100 && oldProgress < 100) {
    if (state.currentHouseId) {
      // House cleared → becomes safe
      res.newTensionLevel = 0;
      res.narrativeInstruction += '\n【系统强制 - 里程碑】：该建筑威胁已被彻底肃清，变为安全屋，主角可安心休整。';
    } else {
      // Node fully explored → Boss spawns!
      res.newTensionLevel = 4;
      res.narrativeInstruction += '\n【系统强制 - 里程碑】：区域探索度满！惊动了统治该区域的核心危机，进入死斗！';
    }
  }
  return res;
}

function findSafeRetreatNode(state: GameState): string | null {
  if (!state.worldData || !state.currentNodeId) return null;
  const currentNode = findNode(state, state.currentNodeId);
  if (!currentNode) return null;

  // Find a connected node with lower danger or the first connected node
  for (const connId of currentNode.connections) {
    const connNode = state.worldData.nodes.find(n => n.id === connId);
    if (connNode && (connNode.safetyLevel === 'safe' || connNode.safetyLevel === 'low')) {
      return connId;
    }
  }
  // Fallback: return first connection
  return currentNode.connections[0] || state.currentNodeId;
}

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

      const intent = await extractIntent(
        userInput,
        state.currentNodeId!,
        state.currentHouseId,
        visionContext,
        currentNode.connections,
        state.language
      );

      console.log("Intent:", intent);

      // ── Step 2: D20 State Machine Resolution ──
      const d20 = Math.floor(Math.random() * 20) + 1;
      const resolution = resolveD20(state, intent, d20);

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
      const updatedNode = findNode(state, resolution.newNodeId);
      const updatedVision = updatedNode ? (() => {
        const visHouses = getVisibleHouses(updatedNode, resolution.newProgressMap);
        const hStr = visHouses.length > 0
          ? visHouses.map(h => `${h.name}(${h.type})`).join(', ')
          : '尚未发现可互动的建筑';
        const updatedHouse = findHouse(updatedNode, resolution.newHouseId);
        const locStr = updatedHouse
          ? `当前位于: ${updatedNode.name} → ${updatedHouse.name}`
          : `当前位于: ${updatedNode.name}(野外街区)`;
        return `${locStr}. 已揭盲可互动的微观建筑: ${hStr}`;
      })() : visionContext;

      const progressKey = resolution.newHouseId
        ? `house_${resolution.newHouseId}`
        : `node_${resolution.newNodeId}`;
      const currentProgress = resolution.newProgressMap[progressKey] || 0;

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
- 绝对位置与可用视野：${updatedVision}
- 健康状态：${getHpDescription(resolution.newHp, state.language)}（HP: ${resolution.newHp}/100）
- 探索进度：${currentProgress}%（【揭盲锁】：未满100%绝不可描写彻底探索完毕！）
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

      console.log(fullPrompt);

      // ── Call LLM for story rendering ──
      const responseJson = await generateTurn(fullPrompt);
      console.log("AI Response JSON:", responseJson);
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
