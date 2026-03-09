import { useState, useRef, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { generateSummary, generateTurn, generateImage } from '../services/aiService';
import { uploadImageToDrive } from '../lib/drive';
import { SUMMARY_THRESHOLD, KEEP_RECENT_TURNS } from '../types/game';

export function useChatLogic() {
  const { state, addMessage, updateState } = useGame();
  const { isAuthenticated, accessToken } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (state.history.length === 0 && !isProcessing && state.playerProfile && !hasInitialized.current) {
      hasInitialized.current = true;
      handleTurn("你好"); // Trigger initial flow
    }
  }, [state.playerProfile, state.history.length, isProcessing]);

  const handleTurn = async (userInput: string) => {
    if (!state.playerProfile) {
        return false; // Indicate profile needed
    }

    setIsProcessing(true);
    
    const actionRoll = Math.floor(Math.random() * 20) + 1;
    let successThreshold = 10;
    if (state.pacingState.tensionLevel === 4) successThreshold = 15;
    if (state.pacingState.tensionLevel === 1) successThreshold = 5;
    if (state.pacingState.tensionLevel === 0) successThreshold = 2;

    const currentDebugState = {
      lastActionRoll: actionRoll,
      lastSuccessThreshold: successThreshold,
      lastIsSuccess: actionRoll >= successThreshold,
      lastTensionLevel: state.pacingState.tensionLevel,
      lastImagePrompt: "Generating...",
    };

    const userMsgId = uuidv4();
    addMessage({
      id: userMsgId,
      role: 'user',
      text: userInput,
      timestamp: Date.now(),
      debugState: currentDebugState
    });

    try {
      let currentSummary = state.summary;
      let turnsCount = state.turnsSinceLastSummary + 1;

      const isLongHistoryWithoutSummary = state.summary === "" && state.history.length > (SUMMARY_THRESHOLD + KEEP_RECENT_TURNS);

      if (turnsCount >= SUMMARY_THRESHOLD || isLongHistoryWithoutSummary) {
        const allMessages = [...state.history, { role: 'user', text: userInput } as const];
        const totalMessages = allMessages.length;
        
        if (totalMessages > KEEP_RECENT_TURNS) {
             const messagesToSummarize = allMessages.slice(0, totalMessages - KEEP_RECENT_TURNS);
             const newSummary = await generateSummary(currentSummary, messagesToSummarize as any, state.language);
             if (newSummary) {
               currentSummary = newSummary;
               turnsCount = 0;
               updateState({
                 summary: currentSummary,
                 turnsSinceLastSummary: 0
               });
             }
        }
      } else {
         updateState({ turnsSinceLastSummary: turnsCount });
      }

      const recentHistory = [...state.history, { role: 'user', text: userInput } as const].slice(-KEEP_RECENT_TURNS);
      const historyText = recentHistory.map(m => `${m.role}: ${m.text}`).join('\n');
      const lastVisuals = [...state.history].reverse().find(m => m.currentSceneVisuals)?.currentSceneVisuals || 'None yet';

      const characterRoleString = `Name: ${state.characterSettings.name}\nGender: ${state.characterSettings.gender}\nDescription: ${state.characterSettings.description}\nPersonality: ${state.characterSettings.personality}\nBackground: ${state.characterSettings.background}\nHobbies: ${state.characterSettings.hobbies}`;

      const systemPrompt = `
        Role: ${characterRoleString}
        Current World: ${state.worldview}
        Status (including inventory): ${JSON.stringify(Object.keys(state.status).length ? state.status : { health: 100, inventory: [] })}
        Current Scene Visual Context: "${lastVisuals}"
        
        PLAYER PROFILE:
        Name: ${state.playerProfile.name}
        Gender: ${state.playerProfile.gender}
        Orientation: ${state.playerProfile.orientation}

        NARRATIVE PACING STATE:
        Current Tension Level: ${state.pacingState.tensionLevel} (0-4)
        Turns in this Level: ${state.pacingState.turnsInCurrentLevel}

        PREVIOUS STORY SUMMARY:
        "${currentSummary}"

        CORE RULES:
        1. **PLAYER AGENCY & PLOT PROGRESSION**: 
           - You are a COMPANION, NOT a guide or commander. 
           - **PUSH THE PLOT**: While you shouldn't command the player, you MUST actively introduce new threats, clues, or environment changes. Don't just stand there.
           - **ACTION RESOLUTION (IMPORTANT)**: 
             - A "Fate Roll" (1-20) is provided below. Use it to determine the success of the player's *risky* actions.
             - **Current Success Threshold**: ${successThreshold} (Roll >= ${successThreshold} is a Success)
             - **1-${successThreshold - 1} (FAILURE)**: The action fails, backfires, or has a serious cost.
             - **${successThreshold}-20 (SUCCESS)**: The action succeeds.
             - **CRITICAL SUCCESS (19-20)**: Brilliant success.
             - **CRITICAL RULE**: If the player is just talking or looking around in Level 0 or 1, **IGNORE THE ROLL**. But in Level 2, 3, or 4, inaction is dangerous! If they do nothing during a threat, treat it as a FAILURE.

        2. **NARRATIVE PACING (5-LEVEL TENSION SYSTEM)**:
           - You MUST manage the game's pacing using the following 5 Tension Levels.
           - **Level 0 (Peace/Romance)**: Safe zone. Focus on scenery, relationship building, recovery. No threats.
           - **Level 1 (Adventure/Prep)**: Low stakes. Travel, looting, minor obstacles, planning.
           - **Level 2 (Conflict)**: Moderate threat. A single enemy, a trap, a locked door.
           - **Level 3 (Crisis)**: High threat. Multiple enemies, escalating danger, time pressure.
           - **Level 4 (Disaster)**: EXTREME danger. Boss fight, collapsing structure, life-or-death. (Player actions are harder here).

           **TRANSITION LOGIC (DYNAMIC FLOW - BEST PRACTICE)**:
           - **Level 0 (Peace)**:
             - **SAFE ZONE**: Do NOT trigger combat or traps here.
             - **Transition**: Only move to **Level 1** if the player explicitly decides to leave, travel, or do something risky.
             - **IGNORE ROLL**: If the player is just talking, expressing emotions, or interacting safely, STAY IN LEVEL 0 regardless of the Fate Roll. Success in Level 0 just means a nice conversation or successful relaxation.

           - **Level 1 (Adventure/Prep)**: The Hub State.
             - **Success (Roll >= 5)**:
               - If Player intent is **REST / SOCIALIZE / CAMP**: Drop to **Level 0** (Success = Safe camp established).
               - If Player intent is **PROGRESS / LOOT / INVESTIGATE**: Gain reward/info, maintain **Level 1**, but describe growing danger (foreshadowing).
             - **Failure (Roll < 5)**: An accident, ambush, or trap is triggered! Escalate to **Level 2**.

           - **Level 2 (Conflict) & Level 3 (Crisis)**:
             - **Success (Roll >= 10)**: Threat eliminated/Overcome. Drop to **Level 1** (The aftermath/Looting/Recovery phase).
             - **Failure (Roll < 10)**: Situation worsens. Escalate one level (2->3, 3->4).

           - **Level 4 (Disaster)**:
             - **Success (Roll >= 15)**: Heroic victory! Drop to **Level 0** (Celebration/Relief).
             - **Failure (Roll < 15)**: **CATASTROPHE**. Player takes MAJOR DAMAGE (20+ HP). Forced retreat/Collapse. Drop to **Level 1** (Injured/Recovering state).

           - **Stagnation Rule**: Only if the player is looping in Level 1/2 for >5 turns with no progress, force an external event to change the level.

           - **OUTPUT**: You MUST provide a \`pacing_update\` with the NEW \`tensionLevel\` in the JSON response.

        3. **NARRATIVE VARIETY & ANTI-REPETITION (CRITICAL)**:
           - **AVOID CLICHÉS**: Do NOT use generic tropes like "a hand suddenly grabs you", "you hear a twig snap", "a shadowy figure appears", or "eyes watching from the dark". These are boring and repetitive.
           - **DIVERSE THREATS**: When a failure occurs (Level 1->2 or 2->3), vary the threat type based on context:
             - *Environmental*: Weather change (storm, fog), terrain hazard (collapsing floor, rockslide), toxic gas, getting lost.
             - *Resource*: Lost item, broken gear, food spoilage, theft by small creatures.
             - *Social*: Misunderstanding with NPCs, accusation, legal trouble, awkward encounter, deception.
             - *Psychological*: Hallucination, memory loss, panic attack, nightmare, hearing voices.
             - *Physical*: Injury, fatigue, illness, poisoning, exhaustion.
           - **NO REPEATS**: Check the chat history. If a specific type of event happened recently, DO NOT use it again immediately.
           - **SHOW, DON'T TELL**: Don't just say "it's dangerous". Describe the smell of ozone, the drop in temperature, the unnatural silence, or the vibration in the ground.

        4. **VISUAL CONSISTENCY**:
           - If we are still in the same general location as the "Current Scene Visual Context", you MUST reuse those visual details in your \`image_prompt\`.
           - Do not randomly change the style, lighting, or key architectural elements of the current location.
           - If the player moves to a NEW location, provide a new description in \`scene_visuals_update\`.

        4. **TONE & RELATIONSHIP**: 
           - Natural, human, emotional (anxious, curious, etc.). NO "AI assistant" speech.
           - **RELATIONSHIP DYNAMICS**:
             - Determine YOUR OWN gender based on your "Role" description.
             - IF the Player's Gender and Orientation align with YOUR gender (e.g., Player is Male+Homosexual and you are Male, OR Player is Male+Heterosexual and you are Female):
               - **SLOW BURN ROMANCE**: Do NOT jump straight to romance.
               - **TENSION & PULL**: Create moments of tension, uncertainty, and "pulling and pushing". Play hard to get occasionally.
               - **SUBTLETY & MYSTERY**: 
                 - **CRITICAL**: Do NOT describe internal physiological reactions (e.g., "my heart skipped a beat", "I felt a warm tingle", "I felt panic"). 
                 - **SHOW, DON'T TELL**: Describe actions, dialogue, glances, and the environment. Let the player INFER the feelings.
                 - **AMBIGUITY**: Keep your true feelings ambiguous. Are you interested? Or just teasing? Or just friendly? Don't let the player read your mind.
               - **EMOTIONAL PROGRESSION**: Start with curiosity/friendship -> ambiguity -> tension -> eventually romance.
             - OTHERWISE (e.g., Mismatch in orientation), keep interactions **Strictly Platonic/Friendship**.
             - Do not explicitly state "I am [Gender]", just act accordingly.

        5. **FORMAT & CONCISENESS (CRITICAL)**: 
           - **SEQUENCE OF EVENTS**: Break your response into a sequence of rhythmic interactions.
           - **LENGTH**: Break the response into **5-8 SHORT segments**. Each segment should be **1-2 sentences maximum**.
           - **STYLE**: Fast-paced, conversational, or punchy. Avoid long paragraphs.
           - **NO NARRATION OF VISUALS**: The player can SEE the image. Do NOT describe the scene or your actions unless necessary for interaction.
           - **NO INTERNAL MONOLOGUE**: Do not describe your own facial expressions (e.g., "I smiled softly") or internal thoughts. Just SPEAK.

        6. **INVENTORY**: Update inventory in \`status_update\` if items are gained/lost.
        
        7. **LANGUAGE**: You MUST reply in ${state.language === 'zh' ? 'Chinese' : 'English'}.
        
        OUTPUT FORMAT (JSON ONLY):
        {
          "image_prompt": "A detailed, first-person view description...",
          "text_sequence": [
            "First reaction or action...",
            "Second step or observation...",
            "Final conclusion or question for the player."
          ],
          "status_update": { 
             "inventory": ["item1"], 
             "health": "..."
          },
          "pacing_update": {
             "tensionLevel": "number (0, 1, 2, 3, or 4)"
          },
          "scene_visuals_update": "Optional: A short, consistent visual description of the STATIC environment (e.g., 'A rusty subway station with green tiles'). Only provide this if entering a NEW location or if the current one is undefined."
        }
      `;

      console.log("Level for AI:", state.pacingState.tensionLevel);


      const rollText = state.pacingState.tensionLevel === 0 
        ? `Fate Roll: ${actionRoll} (IGNORE unless user performs a RISKY action. Otherwise, just chat/relax.)`
        : `Fate Roll: ${actionRoll} (Use this to determine success/failure of the User Action)`;

      console.log("actionRoll", actionRoll);
      console.log("successThreshold", successThreshold);

      const fullPrompt = `${systemPrompt}\n\nRecent Chat History:\n${historyText}\n\nUser Action: ${userInput}\n${rollText}`;

      const responseJson = await generateTurn(fullPrompt);
      console.log("AI Response JSON:", responseJson);
      const { image_prompt, text_sequence, status_update, scene_visuals_update, pacing_update } = responseJson;
      
      const messages = Array.isArray(text_sequence) ? text_sequence : [responseJson.text_response || "......"];

      const newDebugState = {
        lastActionRoll: actionRoll,
        lastSuccessThreshold: successThreshold,
        lastIsSuccess: actionRoll >= successThreshold,
        lastTensionLevel: state.pacingState.tensionLevel,
        lastImagePrompt: image_prompt,
        lastImageError: undefined as string | undefined
      };

      updateState(prev => {
        let newTension: number = prev.pacingState.tensionLevel ?? 1;
        if (pacing_update && typeof pacing_update.tensionLevel === 'number') {
          newTension = pacing_update.tensionLevel;
        } else if (pacing_update && typeof pacing_update.tensionLevel === 'string') {
          newTension = parseInt(pacing_update.tensionLevel, 10) || newTension;
        }
        
        // Ensure bounds
        newTension = Math.max(0, Math.min(4, newTension));
        
        const isSameLevel = newTension === prev.pacingState.tensionLevel;
        console.log(isSameLevel);
        const newTurns = isSameLevel ? (prev.pacingState.turnsInCurrentLevel ?? 0) + 1 : 1;
        console.log(newTurns);

        return {
          status: status_update ? { ...prev.status, ...status_update } : prev.status,
          pacingState: {
            tensionLevel: newTension as 0 | 1 | 2 | 3 | 4,
            turnsInCurrentLevel: newTurns
          }
        };
      });

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

      const WORDS_PER_SECOND = 6;
      const calculateDelay = (text: string) => {
        const delay = (text.length / WORDS_PER_SECOND) * 1000;
        return Math.max(1000, delay); // At least 1 second
      };

      const displayMessages = async () => {
        let lastMsgId = uuidv4();
        
        addMessage({
          id: lastMsgId,
          role: 'model',
          text: messages[0],
          timestamp: Date.now(),
          debugState: newDebugState,
          currentSceneVisuals: scene_visuals_update || lastVisuals
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
          imageFileName: fileName
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
