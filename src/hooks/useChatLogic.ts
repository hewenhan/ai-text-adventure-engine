import { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { generateSummary, generateTurn, extractIntent, resolveObjectivePathfinding, generateQuestChain, generateQuestCompletionNarration } from '../services/aiService';
import { runPipeline, buildVisionContext } from '../lib/pipeline';
import { useGrandNotification, type GrandNotificationData } from '../components/GrandNotification';
import { SUMMARY_THRESHOLD, KEEP_RECENT_TURNS, INVENTORY_CAPACITY, bossTensionFromSafety, rollEscapeRarity, pickEscapeIcon } from '../types/game';
import type { QuestStage, InventoryItem, Rarity } from '../types/game';

import {
  buildIntentContext,
  maybeEscalateToSeekQuest, runDirector, advanceQuestChain,
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

  // ── Bag entry: blocking discard panel state ──
  const [pendingBagItem, setPendingBagItem] = useState<InventoryItem | null>(null);
  const bagResolveRef = useRef<(() => void) | null>(null);

  /** Try to add item to bag. If full, show DiscardPanel and wait for user to discard one. */
  const addItemToBag = useCallback(async (item: InventoryItem): Promise<void> => {
    // Check current inventory size (read from state ref)
    const currentState = state;
    if (currentState.inventory.length < INVENTORY_CAPACITY) {
      updateState(prev => ({ inventory: [...prev.inventory, item] }));
      showNotification({ type: 'discovery', title: '获得道具！', description: `${item.icon} ${item.name}（${item.rarity}）` });
      return;
    }
    // Bag full → show discard panel and block until resolved
    setPendingBagItem(item);
    return new Promise<void>(resolve => {
      bagResolveRef.current = resolve;
    });
  }, [state, updateState, showNotification]);

  /** Called from DiscardPanel: discard selected item, add pending item, dismiss panel */
  const resolveBagDiscard = useCallback((discardItemId: string) => {
    const item = pendingBagItem;
    if (!item) return;
    updateState(prev => ({
      inventory: [...prev.inventory.filter(i => i.id !== discardItemId), item],
    }));
    showNotification({ type: 'discovery', title: '获得道具！', description: `${item.icon} ${item.name}（${item.rarity}）` });
    setPendingBagItem(null);
    if (bagResolveRef.current) {
      bagResolveRef.current();
      bagResolveRef.current = null;
    }
  }, [pendingBagItem, updateState, showNotification]);

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

  const lockRef = useRef(false);
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
    if (lockRef.current) return false;
    lockRef.current = true;

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

      // ── Step 1.5a: 特殊 targetId 归一化 ──
      // "outdoors" 是 AI 返回的语义别名，归一化为 null，pipeline 自然走 exit-building
      if (intent.targetId === 'outdoors') {
        intent.targetId = null;
      }

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

      // ── Step 1.6: Quest chain generation (async) ──
      let pendingQuestItem: InventoryItem | null = null; // first stage item, inject after pipeline
      if (directorResult.needsQuestChainGeneration && state.worldData && state.currentNodeId) {
        try {
          const chainResult = await generateQuestChain(
            state.worldview, state.worldData, state.currentNodeId, state.language
          );

          // Build QuestStage array
          const questStages: QuestStage[] = chainResult.stages.map((s, i) => ({
            stageIndex: i,
            targetNodeId: chainResult.targetLocations[i]?.nodeId ?? '',
            targetHouseId: chainResult.targetLocations[i]?.houseId ?? '',
            targetLocationName: chainResult.targetLocations[i]?.locationName ?? '',
            description: s.description,
            requiredItems: s.requiredItems,
            completed: false,
            arrivedAtTarget: false,
          }));

          if (questStages.length > 0) {
            const firstStage = questStages[0];
            const firstObjective = {
              targetNodeId: firstStage.targetNodeId,
              targetHouseId: firstStage.targetHouseId,
              targetLocationName: firstStage.targetLocationName,
              description: firstStage.description,
            };

            // Build the first stage's quest item (only give first stage item now)
            if (firstStage.requiredItems.length > 0) {
              const ri = firstStage.requiredItems[0];
              pendingQuestItem = {
                id: ri.id,
                name: ri.name,
                type: 'quest' as const,
                description: `任务道具 - ${firstStage.description}`,
                rarity: 'common' as const,
                icon: '📜',
                quantity: 1,
                buff: null,
              };
            }

            // Save quest chain & objective (inventory will be updated after pipeline)
            updateState({
              questChain: questStages,
              currentQuestStageIndex: 0,
              currentObjective: firstObjective,
            });

            // Quest notification
            directorResult.questNotification = {
              type: 'quest',
              title: '新任务链！',
              description: firstStage.description,
            };
            directorResult.questDiscoveryNotification = {
              type: 'discovery',
              title: '目标地点',
              description: `前往【${firstStage.targetLocationName}】`,
            };

            // Override narrative with actual quest content so AI's dialogue matches
            const questItemName = pendingQuestItem?.name ?? '一件关键道具';
            directorResult.narrativeOverride = `【系统强制 - 新任务派发】：伴游 NPC 刚得到重要消息，向玩家透露了一项紧急任务。请 NPC 用自己的风格向玩家转述以下任务内容：\n任务目标：${firstStage.description}\n目标地点：${firstStage.targetLocationName}\n同时，NPC 将一件道具交给了玩家：【${questItemName}】，这是完成第一环任务的关键物品。请描写 NPC 交付道具的场景。`;

            console.log('[QuestChain] Generated', questStages.length, 'stages, first item:', pendingQuestItem?.name);
          }
        } catch (e) {
          console.error('[QuestChain] Generation failed:', e);
        }
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

      // ── Step 3.5: Quest chain post-pipeline logic ──
      // Quest item usage: use_item with quest item matching current stage requiredItems
      if (intent.intent === 'use_item' && intent.itemName && state.questChain) {
        const currentStage = state.questChain[state.currentQuestStageIndex];
        if (currentStage && !currentStage.completed) {
          const matchedItem = currentStage.requiredItems.find(
            ri => ri.id === intent.itemName || ri.name === intent.itemName
          );
          if (matchedItem) {
            const atTargetLocation = resolution.newNodeId === currentStage.targetNodeId;
            if (atTargetLocation) {
              // At target location → consume quest item
              resolution.newInventory = resolution.newInventory.filter(i => i.id !== matchedItem.id);
              // Check if all required items for this stage have been used
              const remainingRequired = currentStage.requiredItems.filter(
                ri => ri.id !== matchedItem.id && resolution.newInventory.some(inv => inv.id === ri.id)
              );
              if (remainingRequired.length === 0) {
                resolution.narrativeInstruction = `【系统强制 - 任务道具使用】：玩家成功使用了【${matchedItem.name}】，完成了当前任务环节并且消耗掉！\n` + resolution.narrativeInstruction;
              } else {
                resolution.narrativeInstruction = `【系统强制 - 任务道具使用】：玩家使用了【${matchedItem.name}】。请描写道具消耗掉的效果。\n` + resolution.narrativeInstruction;
              }
            } else {
              // NOT at target location → keep the item, tell player where to go
              resolution.narrativeInstruction = `【系统强制 - 任务道具无法使用】：玩家使用了【${matchedItem.name}】，请 NPC 结合上下文使用道具而不消耗道具\n` + resolution.narrativeInstruction;
            }
          }
        }
      }

      // Quest crisis anchoring: arriving at quest target location triggers elevated tension
      if (state.questChain && !resolution.newTransitState) {
        const currentStage = state.questChain[state.currentQuestStageIndex];
        if (currentStage && !currentStage.arrivedAtTarget
          && resolution.newNodeId === currentStage.targetNodeId
          && resolution.newNodeId !== state.currentNodeId) {
          // First arrival at quest target - anchor crisis based on safety
          const targetNode = state.worldData?.nodes.find(n => n.id === currentStage.targetNodeId);
          if (targetNode) {
            const crisisTension = bossTensionFromSafety(targetNode.safetyLevel);
            if (crisisTension && crisisTension > resolution.newTensionLevel) {
              resolution.newTensionLevel = crisisTension;
              resolution.tensionChanged = true;
            }
            // Mark as arrived (will be persisted in updateState below)
            updateState(prev => {
              if (!prev.questChain) return {};
              const updated = [...prev.questChain];
              updated[prev.currentQuestStageIndex] = { ...updated[prev.currentQuestStageIndex], arrivedAtTarget: true };
              return { questChain: updated };
            });
            resolution.narrativeInstruction = `【系统强制 - 任务目标抵达】：玩家抵达了任务目标所在地【${targetNode.name}】！这里危机四伏，需要小心行事。\n` + resolution.narrativeInstruction;
          }
        }
      }

      console.log("D20 Roll:", d20, "Resolution:", resolution);

      // ── Step 3.9: Pre-roll item drop + build prompt instruction ──
      // explore + success → 25% chance to find item, TS picks rarity, AI picks name
      let escapeItemRarity: Rarity | null = null;
      let itemDropInstruction: string | null = null;
      const isExploreSuccess = resolution.isSuccess && intent.intent === 'explore' && !resolution.newTransitState;
      if (isExploreSuccess) {
        if (Math.random() < 0.25) {
          escapeItemRarity = rollEscapeRarity();
          itemDropInstruction = `\n【搜刮结果 - 有收获】：发现了一件${escapeItemRarity}品质的道具！（根据世界观和当前场景合理创名），并在 get_item 字段中返回道具名称和简短说明。`;
        } else {
          itemDropInstruction = `\n【搜刮结果 - 无收获】：结合世界观上下文合理描写`;
        }
      }

      // ── Step 3.9b: Equipment drop (guaranteed from milestone/boss, or random on crit explore) ──
      let prerolledEquipDrop: InventoryItem | null = null;
      const shouldDropEquip = resolution.guaranteedDrop
        || (isExploreSuccess && resolution.roll >= 17 && Math.random() < 0.3);
      if (shouldDropEquip) {
        const presets = state.equipmentPresets;
        if (presets.length > 0) {
          const idx = Math.floor(Math.random() * presets.length);
          prerolledEquipDrop = presets[idx];
          updateState(prev => {
            const newPresets = [...prev.equipmentPresets];
            newPresets.splice(idx, 1);
            return { equipmentPresets: newPresets };
          });
        }
      }

      // ── Step 4: Write state ──
      // 收集本回合需要额外揭盲的建筑 ID（任务目标）
      const additionalRevealIds = directorResult.newObjective?.targetHouseId
        ? [directorResult.newObjective.targetHouseId]
        : undefined;
      updateState(buildStateUpdate(resolution, additionalRevealIds));

      if (debugOv) {
        applyDebugDirectWrites(debugOv, updateState);
      }

      // 动态记忆锁：旅途结束时将 lockedTheme 推入黑名单（FIFO, 上限 20）
      if (!resolution.newTransitState && state.transitState?.lockedTheme) {
        updateState(prev => {
          const updated = [...prev.exhaustedThemes, state.transitState!.lockedTheme!];
          return { exhaustedThemes: updated.length > 20 ? updated.slice(-20) : updated };
        });
      }

      // ── Step 4.5: (moved to step 3.9b — pre-roll equipment drop) ──

      // ── Step 5: Build notifications ──
      const pendingNotifications = buildNotifications(state, resolution, directorResult);

      // ── Step 6: Build LLM prompt & call ──
      const fullPrompt = buildStoryPrompt({
        state, resolution, currentSummary, userInput, visionContext,
        itemDropInstruction,
        expectGetItem: !!escapeItemRarity,
      });

      const responseJson = await generateTurn(fullPrompt);
      const { image_prompt, text_sequence, scene_visuals_update, hp_description, encounter_tag, affection_change, get_item } = responseJson;

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

      // ── Step 7.2: Build unified pending bag items ──
      const pendingBagItems: InventoryItem[] = [];

      // Quest item from quest chain generation
      if (pendingQuestItem) pendingBagItems.push(pendingQuestItem);

      // Equipment drop (pre-rolled in step 3.9b)
      if (prerolledEquipDrop) pendingBagItems.push(prerolledEquipDrop);

      // Escape item from AI response (get_item)
      if (escapeItemRarity && get_item && get_item.name) {
        pendingBagItems.push({
          id: `escape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: get_item.name,
          type: 'escape',
          description: get_item.description || '战斗中使用可抵消一次失败惩罚',
          rarity: escapeItemRarity,
          icon: pickEscapeIcon(escapeItemRarity),
          quantity: 1,
          buff: null,
        });
      }

      // ── Step 7.5: Quest stage completion check ──
      let questNarratorText: string | null = null;
      if (intent.intent === 'use_item' && intent.itemName && state.questChain) {
        const stageIdx = state.currentQuestStageIndex;
        const currentStage = state.questChain[stageIdx];
        if (currentStage && !currentStage.completed) {
          // Check if all requiredItems for current stage have been consumed (no longer in inventory)
          const inventorySnapshot = resolution.newInventory;
          const allItemsUsed = currentStage.requiredItems.every(
            ri => !inventorySnapshot.some(inv => inv.id === ri.id)
          );
          if (allItemsUsed && resolution.newNodeId === currentStage.targetNodeId) {
            // Stage completed!
            const { nextObjective, questCompleted } = advanceQuestChain(state);

            if (questCompleted) {
              // All stages done → generate narrator text + clear quest chain
              try {
                questNarratorText = await generateQuestCompletionNarration(
                  state.worldview,
                  state.questChain.map(s => s.description).join(' → '),
                  state.companionProfile.name,
                  state.language
                );
              } catch {
                questNarratorText = '任务链已完成。新的冒险即将开始。';
              }
              updateState({
                questChain: state.questChain.map((s, i) => i === stageIdx ? { ...s, completed: true } : s),
                currentObjective: null,
              });
            } else if (nextObjective) {
              // Advance to next stage
              const nextStageData = state.questChain[stageIdx + 1];
              const nextQuestItem: InventoryItem | null = nextStageData?.requiredItems?.[0]
                ? {
                    id: nextStageData.requiredItems[0].id,
                    name: nextStageData.requiredItems[0].name,
                    type: 'quest' as const,
                    description: `任务道具 - ${nextStageData.description}`,
                    rarity: 'common' as const,
                    icon: '📜',
                    quantity: 1,
                    buff: null,
                  }
                : null;

              updateState(prev => ({
                questChain: (prev.questChain || []).map((s, i) => i === stageIdx ? { ...s, completed: true } : s),
                currentQuestStageIndex: stageIdx + 1,
                currentObjective: nextObjective,
              }));
              pendingNotifications.push({
                type: 'quest',
                title: `任务环节${stageIdx + 2}！`,
                description: nextObjective.description,
              });
              // Next quest item will be added via unified bag flow after display sequence
              if (nextQuestItem) {
                pendingBagItems.push(nextQuestItem);
              }
            }
          }
        }
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
      await runDisplaySequence({
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

      // ── Step 9.5: Unified bag entry — after all messages displayed ──
      for (const item of pendingBagItems) {
        await addItemToBag(item);
      }

      // ── Step 9.6: Quest completion narrator message ──
      if (questNarratorText) {
        addMessage({
          id: uuidv4(),
          role: 'narrator',
          text: questNarratorText,
          timestamp: Date.now(),
        });
      }

    } catch (error) {
      console.error("Failed to process turn", error);
      addMessage({
        id: uuidv4(),
        role: 'model',
        text: "（系统错误：无法生成回复，请重试）",
        timestamp: Date.now()
      });
      setIsProcessing(false);
    } finally {
      lockRef.current = false;
    }
    return true;
  };

  return {
    isProcessing,
    handleTurn,
    flushPendingNotifications,
    pendingBagItem,
    resolveBagDiscard,
  };
}
