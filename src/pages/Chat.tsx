import { useEffect, useRef, useState, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { ai, TEXT_MODEL, IMAGE_MODEL } from '../lib/gemini';
import { uploadImageToDrive, getImageUrlByName } from '../lib/drive';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Download, Loader2, Image as ImageIcon, AlertCircle, Backpack, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import clsx from 'clsx';
import { SUMMARY_THRESHOLD, KEEP_RECENT_TURNS, PlayerProfile, DEFAULT_LOADING_MESSAGES, INITIAL_STATE } from '../types/game';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { ChatMessageItem } from '../components/ChatMessageItem';
import { DebugOverlay } from '../components/DebugOverlay';

export default function Chat() {
  const { state, addMessage, exportSave, updateState } = useGame();
  const { accessToken, isAuthenticated } = useAuth();
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // Loading Message State
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(DEFAULT_LOADING_MESSAGES[0]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      // Use custom messages if available, otherwise default
      const messages = state.loadingMessages && state.loadingMessages.length > 0 
        ? state.loadingMessages 
        : DEFAULT_LOADING_MESSAGES;
        
      // Set initial random message
      setCurrentLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);

      interval = setInterval(() => {
        const randomIndex = Math.floor(Math.random() * messages.length);
        setCurrentLoadingMessage(messages[randomIndex]);
      }, 3000); // Change message every 3 seconds for chat
    }
    return () => clearInterval(interval);
  }, [isProcessing, state.loadingMessages]);

  // Profile Completion State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempGender, setTempGender] = useState<PlayerProfile['gender']>('Male');
  const [tempOrientation, setTempOrientation] = useState<PlayerProfile['orientation']>('Heterosexual');

  // Check for missing profile on mount
  useEffect(() => {
    if (!state.playerProfile) {
      setShowProfileModal(true);
    }
  }, [state.playerProfile]);

  // Background task: Fetch custom loading messages if missing (for old saves)
  useEffect(() => {
    const fetchMissingLoadingMessages = async () => {
      // Only run if we have a worldview but no custom loading messages (using default)
      // We check if the first message is one of the defaults to determine if we are using defaults
      const isUsingDefaults = state.loadingMessages === DEFAULT_LOADING_MESSAGES || 
                              (state.loadingMessages.length > 0 && DEFAULT_LOADING_MESSAGES.includes(state.loadingMessages[0]));
      
      if (state.worldview && isUsingDefaults && !isProcessing) {
        console.log("Fetching custom loading messages for old save...");
        try {
          const prompt = `
            Current Worldview: "${state.worldview}"
            
            Task: Generate 50 short, humorous, immersive "loading screen" messages related to this world theme. 
            Examples: "Connecting to neural net...", "Polishing slime...", "Calibrating gravity...". 
            Make them creative and relevant to the specific world theme.
            
            Return ONLY a JSON array of strings. No markdown formatting.
            Translate to Chinese.
          `;
          
          const result = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
          });

          const text = result.text;
          if (text) {
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            const messages = JSON.parse(jsonStr);
            
            if (Array.isArray(messages) && messages.length > 0) {
              updateState({ loadingMessages: messages });
              console.log("Custom loading messages updated!");
            }
          }
        } catch (error) {
          console.error("Failed to fetch background loading messages", error);
          // Silently fail, keep using defaults
        }
      }
    };

    // We only want to run this once on mount or when worldview changes, 
    // NOT when loadingMessages changes (to avoid infinite loops if updateState triggers re-render)
    // However, we need to check the condition.
    // The safest way is to check the condition inside the effect, but limit dependencies.
    // Since we are checking `isUsingDefaults` inside, and `updateState` will change `state.loadingMessages`,
    // we should be careful.
    
    // Actually, if we updateState, `state.loadingMessages` changes, so `isUsingDefaults` becomes false.
    // Then the effect runs again, checks `isUsingDefaults` (false), and does nothing.
    // So it is safe to depend on `state.loadingMessages`.
    
    fetchMissingLoadingMessages();
  }, [state.worldview, state.loadingMessages.length]); // Depend on length to avoid deep comparison issues, and worldview.

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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (state.history.length > 0) {
      // Small delay to ensure rendering is done
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: state.history.length - 1,
          align: 'end',
          behavior: 'smooth'
        });
      }, 100);
    }
  }, [state.history.length]);

  // Image loading callback
  const handleImageLoaded = useCallback((fileName: string, url: string) => {
    setImageUrls(prev => {
      if (prev[fileName]) return prev;
      return { ...prev, [fileName]: url };
    });
  }, []);

  // Function to delete a message (Debug only)
  const handleDeleteMessage = useCallback((index: number) => {
    console.log('Deleting message at index:', index);
    const newHistory = [...state.history];
    if (index >= 0 && index < newHistory.length) {
      const deleted = newHistory.splice(index, 1);
      console.log('Deleted message:', deleted[0]);
      
      // Restore state from the NEW last message (if any)
      const lastMessage = newHistory[newHistory.length - 1];
      
      // 1. Pacing State Restoration
      let newPacingState = state.pacingState;
      if (lastMessage && lastMessage.pacingState) {
        newPacingState = lastMessage.pacingState;
      } else if (newHistory.length === 0) {
        newPacingState = INITIAL_STATE.pacingState;
      } else {
        // Fallback for old saves: Default to tension 0
        newPacingState = { tensionLevel: 0, turnsInCurrentLevel: 0 };
      }

      // 2. Other State Restoration
      // If the message has the state, restore it.
      // If history is empty, reset to initial.
      // If message exists but has no state (old save), keep current state to avoid breaking things.
      const newStatus = lastMessage?.status ?? (newHistory.length === 0 ? INITIAL_STATE.status : state.status);
      const newVisuals = lastMessage?.currentSceneVisuals ?? (newHistory.length === 0 ? INITIAL_STATE.currentSceneVisuals : state.currentSceneVisuals);

      console.log('Restoring state to:', { newPacingState, newStatus });

      updateState({ 
        history: newHistory,
        pacingState: newPacingState,
        status: newStatus,
        currentSceneVisuals: newVisuals
      });
    } else {
      console.error('Invalid index for deletion:', index);
    }
  }, [state.history, state.pacingState, state.status, state.currentSceneVisuals, updateState]);

  // Initial greeting trigger
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (state.history.length === 0 && !isProcessing && state.playerProfile && !hasInitialized.current) {
      hasInitialized.current = true;
      handleTurn("你好"); // Trigger initial flow
    }
  }, [state.playerProfile]); // Only trigger if profile exists

  const handleTurn = async (userInput: string) => {
    if (!state.playerProfile) {
        setShowProfileModal(true);
        return;
    }

    setIsProcessing(true);
    
    // Calculate roll and threshold immediately
    const actionRoll = Math.floor(Math.random() * 20) + 1;
    let successThreshold = 10; // Default
    if (state.pacingState.tensionLevel === 4) successThreshold = 15; // Harder at level 4
    if (state.pacingState.tensionLevel === 1) successThreshold = 5; // Easier at level 1
    if (state.pacingState.tensionLevel === 0) successThreshold = 2; // Level 0 is safe

    const currentDebugState = {
      lastActionRoll: actionRoll,
      lastSuccessThreshold: successThreshold,
      lastIsSuccess: actionRoll >= successThreshold,
      lastTensionLevel: state.pacingState.tensionLevel,
      lastImagePrompt: "Generating...",
    };

    // Optimistic update for user message
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
      let turnsCount = state.turnsSinceLastSummary + 1; // +1 for current user turn

      // Check if we need to summarize
      const isLongHistoryWithoutSummary = state.summary === "" && state.history.length > (SUMMARY_THRESHOLD + KEEP_RECENT_TURNS);

      if (turnsCount >= SUMMARY_THRESHOLD || isLongHistoryWithoutSummary) {
        const allMessages = [...state.history, { role: 'user', text: userInput } as const];
        const totalMessages = allMessages.length;
        
        if (totalMessages > KEEP_RECENT_TURNS) {
             const messagesToSummarize = allMessages.slice(0, totalMessages - KEEP_RECENT_TURNS);
             const textToSummarize = messagesToSummarize.map(m => `${m.role}: ${m.text}`).join('\n');
             
             const summaryPrompt = `
               Current Summary: "${currentSummary}"
               
               New Conversation to Append:
               ${textToSummarize}
               
               Task: Update the summary to include the key events from the new conversation. Keep it concise but retain important plot points, inventory changes, and current status.
               Return ONLY the new summary text.
             `;

             const summaryResult = await ai.models.generateContent({
               model: TEXT_MODEL,
               contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
             });
             
             const newSummary = summaryResult.text;
             if (newSummary) {
               currentSummary = newSummary;
               turnsCount = 0; // Reset counter
               
               updateState({
                 summary: currentSummary,
                 turnsSinceLastSummary: 0
               });
             }
        }
      } else {
         updateState({ turnsSinceLastSummary: turnsCount });
      }

      // 1. Construct Prompt for Game Turn
      const recentHistory = [...state.history, { role: 'user', text: userInput } as const].slice(-KEEP_RECENT_TURNS);
      const historyText = recentHistory.map(m => `${m.role}: ${m.text}`).join('\n');

      const systemPrompt = `
        Role: ${state.characterSettings}
        Current World: ${state.worldview}
        Status (including inventory): ${JSON.stringify(Object.keys(state.status).length ? state.status : { health: 100, inventory: [] })}
        Current Scene Visual Context: "${state.currentSceneVisuals || 'None yet'}"
        
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
             - **CRITICAL RULE**: If the player is just talking, looking around, or in Level 0 (Peace), **IGNORE THE ROLL** unless they explicitly do something dangerous.

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

           - **OUTPUT**: You MUST provide a \`pacing_update\` in the JSON response to update the state.

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
             "tensionLevel": 0 | 1 | 2 | 3 | 4,
             "turnsInCurrentLevel": number
          },
          "scene_visuals_update": "Optional: A short, consistent visual description of the STATIC environment (e.g., 'A rusty subway station with green tiles'). Only provide this if entering a NEW location or if the current one is undefined."
        }
      `;

      // In Level 0, we don't want the model to over-interpret the roll as a call to action/adventure.
      const rollText = state.pacingState.tensionLevel === 0 
        ? `Fate Roll: ${actionRoll} (IGNORE unless user performs a RISKY action. Otherwise, just chat/relax.)`
        : `Fate Roll: ${actionRoll} (Use this to determine success/failure of the User Action)`;

      const fullPrompt = `${systemPrompt}\n\nRecent Chat History:\n${historyText}\n\nUser Action: ${userInput}\n${rollText}`;

      // 2. Generate Text & Image Prompt
      const textResult = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: { responseMimeType: 'application/json' }
      });

      const responseText = textResult.text;
      if (!responseText) throw new Error("No text response");
      
      let responseJson;
      try {
        // Attempt to clean and parse JSON
        const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        responseJson = JSON.parse(cleanedText);
      } catch (e) {
        console.error("JSON Parse Error:", e);
        console.log("Raw Response:", responseText);
        // Fallback: Try to extract JSON from a substring if the model added extra text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
           try {
             responseJson = JSON.parse(jsonMatch[0]);
           } catch (e2) {
             throw new Error("Failed to parse JSON response from model.");
           }
        } else {
           throw new Error("Invalid JSON format from model.");
        }
      }

      const { image_prompt, text_sequence, status_update, scene_visuals_update, pacing_update } = responseJson;
      
      // Handle legacy format (if model returns text_response instead of sequence)
      const messages = Array.isArray(text_sequence) ? text_sequence : [responseJson.text_response || "......"];

      const newDebugState = {
        lastActionRoll: actionRoll,
        lastSuccessThreshold: successThreshold,
        lastIsSuccess: actionRoll >= successThreshold,
        lastTensionLevel: state.pacingState.tensionLevel,
        lastImagePrompt: image_prompt,
        lastImageError: undefined
      };

      // Update internal status
      updateState({ 
        status: status_update ? { ...state.status, ...status_update } : state.status,
        currentSceneVisuals: scene_visuals_update || state.currentSceneVisuals,
        pacingState: pacing_update ? pacing_update : {
          tensionLevel: state.pacingState.tensionLevel ?? 1,
          turnsInCurrentLevel: (state.pacingState.turnsInCurrentLevel ?? 0) + 1
        }
      });

      // 3. Start Image Generation (Async)
      let imagePromise: Promise<string | undefined> = Promise.resolve(undefined);
      
      if (image_prompt && isAuthenticated && accessToken) {
        imagePromise = (async () => {
          try {
            const imageResult = await ai.models.generateContent({
              model: IMAGE_MODEL,
              contents: [{ role: 'user', parts: [{ text: image_prompt }] }]
            });
            
            const candidates = imageResult.candidates;
            if (candidates && candidates[0].content.parts) {
              for (const part of candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                  const base64 = part.inlineData.data;
                  const fileName = `scene_${uuidv4()}.png`;
                  
                  await uploadImageToDrive(accessToken, base64, fileName);
                  setImageUrls(prev => ({ ...prev, [fileName]: `data:image/png;base64,${base64}` }));
                  return fileName;
                }
              }
            }
          } catch (imgError) {
            console.error("Image generation failed", imgError);
          }
          return undefined;
        })();
      }

      // 4. Playback Text Sequence
      // We display all messages EXCEPT the last one immediately (with delays)
      // The LAST message waits for the image.
      
      for (let i = 0; i < messages.length - 1; i++) {
        addMessage({
          id: uuidv4(),
          role: 'model',
          text: messages[i],
          timestamp: Date.now()
        });
        
        // Dynamic delay based on text length, but kept snappy
        // Min 1.5s, Max 3s
        const delay = Math.min(3000, Math.max(1500, messages[i].length * 50));
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      // 5. Final Message + Image
      const finalImageFileName = await imagePromise;
      
      addMessage({
        id: uuidv4(),
        role: 'model',
        text: messages[messages.length - 1],
        imageFileName: finalImageFileName,
        timestamp: Date.now(),
        debugState: newDebugState
      });

    } catch (error) {
      console.error("Turn failed", error);
      alert("出错了，请重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    const json = exportSave();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `save_${new Date().toISOString()}.json`;
    a.click();
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
        <div className="font-bold text-lg tracking-tight">AI 冒险</div>
        <div className="flex items-center gap-2">
          {!isAuthenticated && (
             <div className="text-xs text-amber-500 flex items-center gap-1">
               <AlertCircle className="w-3 h-3" /> Drive 未连接
             </div>
          )}
          <button onClick={() => setShowStatus(true)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors" title="物品栏 & 状态">
            <Backpack className="w-5 h-5" />
          </button>
          <button onClick={handleExport} className="p-2 hover:bg-zinc-800 rounded-full transition-colors" title="导出存档">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Chat Area */}
      <div className="flex-1 p-4 space-y-6 h-full overflow-hidden">
        <Virtuoso
          ref={virtuosoRef}
          data={state.history}
          initialTopMostItemIndex={state.history.length - 1}
          followOutput="smooth"
          context={{ onDelete: handleDeleteMessage, imageUrls, characterName: state.characterSettings.split(' ')[0], onImageLoaded: handleImageLoaded }}
          itemContent={(index, msg, context) => (
            <div className="pb-6">
              <ChatMessageItem 
                msg={msg} 
                characterName={context.characterName}
                imageUrl={msg.imageFileName ? context.imageUrls[msg.imageFileName] : undefined}
                onImageLoaded={context.onImageLoaded}
                onDelete={() => context.onDelete(index)}
              />
            </div>
          )}
          components={{
            Footer: () => (
              isProcessing ? (
                <div className="flex flex-col max-w-3xl mx-auto items-start w-full pb-6 px-4">
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm p-4 flex items-center gap-3">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={currentLoadingMessage}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm text-zinc-400"
                      >
                        {currentLoadingMessage}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
              ) : null
            )
          }}
        />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-zinc-900/50 backdrop-blur-md border-t border-zinc-800">
        <div className="max-w-3xl mx-auto relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleTurn(input).then(() => setInput(""))}
            placeholder={isProcessing ? "等待回复..." : "你要做什么？"}
            disabled={isProcessing}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-full py-3 pl-5 pr-12 focus:ring-2 focus:ring-white/20 outline-none disabled:opacity-50"
          />
          <button 
            onClick={() => { handleTurn(input); setInput(""); }}
            disabled={!input.trim() || isProcessing}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-white text-black rounded-full hover:bg-zinc-200 disabled:opacity-50 disabled:bg-zinc-700 disabled:text-zinc-500 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status Sidebar */}
      <AnimatePresence>
        {showStatus && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowStatus(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm z-20"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              className="absolute right-0 top-0 bottom-0 w-80 bg-zinc-900 border-l border-zinc-800 z-30 p-6 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">状态</h2>
                <button onClick={() => setShowStatus(false)} className="p-1 hover:bg-zinc-800 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">物品栏</h3>
                  {state.inventory.length === 0 ? (
                    <div className="text-zinc-600 italic text-sm">空</div>
                  ) : (
                    <ul className="space-y-2">
                      {state.inventory.map((item, i) => (
                        <li key={i} className="bg-zinc-950 border border-zinc-800 p-2 rounded-lg text-sm">
                          {item}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">角色状态</h3>
                  <pre className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(state.status, null, 2)}
                  </pre>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-zinc-400 mb-2 uppercase tracking-wider">世界观</h3>
                  <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-lg text-sm text-zinc-300">
                    {state.worldview}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Profile Completion Modal */}
      <AnimatePresence>
        {showProfileModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-xl"
            >
              <h2 className="text-xl font-bold mb-2">完善你的资料</h2>
              <p className="text-zinc-400 text-sm mb-6">
                为了继续冒险，请告诉我们更多关于你的信息。这有助于 AI 更好地与你互动。
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">姓名</label>
                  <input
                    type="text"
                    value={tempName}
                    onChange={(e) => setTempName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:ring-2 focus:ring-white/20 outline-none"
                    placeholder="输入你的名字"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">性别</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'Male', label: '男' },
                      { value: 'Female', label: '女' },
                      { value: 'Non-binary', label: '非二元' },
                      { value: 'Other', label: '其他' }
                    ].map((g) => (
                      <button
                        key={g.value}
                        onClick={() => setTempGender(g.value as any)}
                        className={`p-2 rounded-lg text-sm border transition-colors ${
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

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">性取向</label>
                  <select
                    value={tempOrientation}
                    onChange={(e) => setTempOrientation(e.target.value as any)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 focus:ring-2 focus:ring-white/20 outline-none text-sm"
                  >
                    {[
                      { value: 'Heterosexual', label: '异性恋' },
                      { value: 'Homosexual', label: '同性恋' },
                      { value: 'Bisexual', label: '双性恋' },
                      { value: 'Pansexual', label: '泛性恋' },
                      { value: 'Asexual', label: '无性恋' },
                      { value: 'Other', label: '其他' }
                    ].map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleProfileSubmit}
                  disabled={!tempName.trim()}
                  className="w-full bg-white text-black py-3 rounded-xl font-medium hover:bg-zinc-200 disabled:opacity-50 mt-4"
                >
                  保存资料并继续
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      
      <DebugOverlay state={state} />
    </div>
  );
}
