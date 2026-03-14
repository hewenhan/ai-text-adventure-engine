import { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { generateSummary, generateTurn, extractIntent, resolveObjectivePathfinding } from '../services/aiService';
import { runPipeline, buildVisionContext } from '../lib/pipeline';
import { useGrandNotification, type GrandNotificationData } from '../components/GrandNotification';
import { SUMMARY_THRESHOLD, KEEP_RECENT_TURNS } from '../types/game';

import {
  buildIntentContext,
  maybeEscalateToSeekQuest, runDirector,
  applyDebugOverrides, applyNarrativeOverrides, buildStateUpdate, applyDebugDirectWrites,
  buildNotifications,
  buildStoryPrompt,
  launchImageGen,
  runDisplaySequence,
} from './turnSteps';

// Helper to find the index of the Nth-to-last user message
const getStartIndexForRecentTurns = (messages: { role: string }[], turns: number) => {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      count++;
      if (count === turns) return i;
    }
  }
  return 0;
};

// ─── Main Hook ────────────────────────────────────────────────

export function useChatLogic() {
  const { state, addMessage, updateState } = useGame();
  const { isAuthenticated, accessToken } = useAuth();
  const { show: showNotification } = useGrandNotification();
  const [isProcessing, setIsProcessing] = useState(false);
  const pendingNotificationsRef = useRef<Omit<GrandNotificationData, 'id'>[]>([]);

  const setPendingNotificationsRef = useCallback((notifications: Omit<GrandNotificationData, 'id'>[]) => {
    pendingNotificationsRef.current = notifications;
  }, []);

  // ── Typewriter completion synchronization ──
  const typewriterResolveRef = useRef<(() => void) | null>(null);
  const typewriterReadyRef = useRef(false);

  const waitForTypewriter = useCallback(() => {
    if (typewriterReadyRef.current) {
      typewriterReadyRef.current = false;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      typewriterResolveRef.current = resolve;
    });
  }, []);

  const flushPendingNotifications = useCallback(() => {
    if (typewriterResolveRef.current) {
      typewriterResolveRef.current();
      typewriterResolveRef.current = null;
    } else {
      typewriterReadyRef.current = true;
    }
    const items = pendingNotificationsRef.current;
    if (items.length > 0) {
      pendingNotificationsRef.current = [];
      for (const item of items) {
        showNotification(item);
      }
    }
  }, [showNotification]);

  const hasInitialized = useRef(false);

  useEffect(() => {
    if (state.history.length === 0 && !isProcessing && state.playerProfile.name && state.worldData && !hasInitialized.current) {
      hasInitialized.current = true;
      handleTurn("你好");
    }
  }, [state.playerProfile.name, state.worldData, state.history.length, isProcessing]);

  const handleTurn = async (userInput: string) => {
    if (!state.playerProfile.name) return false;
    if (state.isGameOver) return false;
    if (!state.worldData || !state.currentNodeId) return false;

    setIsProcessing(true);

    addMessage({
      id: uuidv4(),
      role: 'user',
      text: userInput,
      timestamp: Date.now(),
    });

    try {
      // ── Step 0: Summary maintenance ──
      let currentSummary = state.summary;
      let turnsCount = state.turnsSinceLastSummary + 1;

      const isLongHistoryWithoutSummary = state.summary === "" && state.history.filter(m => m.role === 'user').length > (SUMMARY_THRESHOLD + KEEP_RECENT_TURNS);

      if (turnsCount >= SUMMARY_THRESHOLD || isLongHistoryWithoutSummary) {
        const allMessages = [...state.history, { role: 'user', text: userInput } as const];
        const recentStartIndex = getStartIndexForRecentTurns(allMessages, KEEP_RECENT_TURNS);
        if (recentStartIndex > 0) {
          const newSummary = await generateSummary(currentSummary, allMessages.slice(0, recentStartIndex) as any, state.language);
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
      const intentCtx = buildIntentContext(state);
      const visionContext = buildVisionContext(state);

      const intent = await extractIntent(
        userInput,
        state.currentNodeId!,
        state.currentHouseId,
        intentCtx.visionContext,
        intentCtx.connectedNodesInfo,
        intentCtx.visibleHousesInfo,
        state.currentObjective?.description || null,
        intentCtx.recentConversation,
        state.language,
        state.pacingState.tensionLevel,
        intentCtx.lastIntent,
        intentCtx.transitInfo
      );

      // ── Step 1.5a: 宏观寻路拦截 ──
      if (intent.targetId === 'current_objective' && state.currentObjective && state.worldData) {
        const pathResult = resolveObjectivePathfinding(
          state.currentNodeId!, state.currentHouseId, state.currentObjective, state.worldData.nodes
        );
        intent.intent = pathResult.intent;
        intent.targetId = pathResult.targetId;
        console.log("Intent (pathfinding resolved):", intent);
      } else {
        console.log("Intent:", intent);
      }

      // ── Step 1.5b: Director system ──
      maybeEscalateToSeekQuest(intent, state);
      const directorResult = runDirector(intent, state);
      if (directorResult.newObjective) {
        updateState({ currentObjective: directorResult.newObjective });
      }

      // ── Step 1.8: 赶路中掉头处理 ──
      let resolveState = state;
      const isRetreatIntent = !!(state.transitState && intent.direction === 'back');
      if (isRetreatIntent) {
        const reversed = {
          fromNodeId: state.transitState!.toNodeId,
          toNodeId: state.transitState!.fromNodeId,
          pathProgress: Math.max(0, 100 - state.transitState!.pathProgress),
          lockedTheme: null,
        };
        resolveState = { ...state, transitState: reversed };
        console.log('Transit RETREAT: reversed', state.transitState, '->', reversed);
      }

      // ── Step 2: Pipeline state machine ──
      const debugOv = state.debugOverrides;
      const d20 = debugOv?.forcedRoll ?? (Math.floor(Math.random() * 20) + 1);
      const resolution = runPipeline(resolveState, intent, d20);

      // ── Step 2.5: Debug overrides ──
      if (debugOv) {
        applyDebugOverrides(resolution, debugOv);
        updateState({ debugOverrides: undefined });
      }

      // ── Step 3: Narrative overrides ──
      applyNarrativeOverrides(resolution, state, directorResult, isRetreatIntent);

      console.log("D20 Roll:", d20, "Resolution:", resolution);

      // ── Step 4: Write state ──
      // 收集本回合需要额外揭盲的建筑 ID（任务目标）
      const additionalRevealIds = directorResult.newObjective
        ? [directorResult.newObjective.targetHouseId]
        : undefined;
      updateState(buildStateUpdate(resolution, additionalRevealIds));

      if (debugOv) {
        applyDebugDirectWrites(debugOv, updateState);
      }

      // 动态记忆锁：旅途结束时将 lockedTheme 推入黑名单
      if (!resolution.newTransitState && state.transitState?.lockedTheme) {
        updateState(prev => ({
          exhaustedThemes: [...prev.exhaustedThemes, state.transitState!.lockedTheme!]
        }));
      }

      // ── Step 5: Build notifications ──
      const pendingNotifications = buildNotifications(state, resolution, directorResult);

      // ── Step 6: Build LLM prompt & call ──
      const fullPrompt = buildStoryPrompt({
        state, resolution, currentSummary, userInput, visionContext,
      });

      const responseJson = await generateTurn(fullPrompt);
      const { image_prompt, text_sequence, scene_visuals_update, hp_description, encounter_tag, affection_change } = responseJson;

      // ── Step 7: Post-LLM state updates ──
      if (typeof affection_change === 'number' && affection_change !== 0) {
        const clampedChange = Math.max(-30, Math.min(10, affection_change));
        updateState(prev => ({
          affection: Math.max(0, Math.min(100, prev.affection + clampedChange))
        }));
      }

      if (encounter_tag && resolution.newTransitState) {
        updateState(prev => {
          if (prev.transitState && !prev.transitState.lockedTheme) {
            return { transitState: { ...prev.transitState, lockedTheme: encounter_tag } };
          }
          return {};
        });
      }

      if (hp_description) {
        updateState({ hpDescription: hp_description });
      }

      const messages = Array.isArray(text_sequence) ? text_sequence : [responseJson.text_response || "......"];
      const lastVisuals = [...state.history].reverse().find(m => m.currentSceneVisuals)?.currentSceneVisuals || 'None yet';

      const newDebugState = {
        lastActionRoll: d20,
        lastSuccessThreshold: 0,
        lastIsSuccess: resolution.isSuccess,
        lastTensionLevel: state.pacingState.tensionLevel,
        lastIntent: intent.intent,
        lastNarrativeInstruction: resolution.narrativeInstruction,
        lastFormula: resolution.formulaBreakdown,
        lastImagePrompt: image_prompt,
        lastImageError: undefined as string | undefined
      };

      // ── Step 8: Image generation (async, non-blocking) ──
      const imagePromise = launchImageGen({
        imagePrompt: image_prompt,
        isAuthenticated,
        accessToken,
        state,
        debugState: newDebugState,
      });

      // ── Step 9: Display sequencing ──
      runDisplaySequence({
        messages,
        debugState: newDebugState,
        sceneVisuals: scene_visuals_update,
        lastVisuals,
        selectedBgmKey: resolution.selectedBgmKey,
        imagePromise,
        pendingNotifications,
        addMessage,
        updateState,
        setIsProcessing,
        setPendingNotificationsRef,
        waitForTypewriter,
        typewriterReadyRef,
        typewriterResolveRef,
      });

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
    handleTurn,
    flushPendingNotifications
  };
}
