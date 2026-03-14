import { ai, TEXT_MODEL, PRO_MODEL, PRO_IMAGE_MODEL, IMAGE_MODEL, LITE_MODEL } from '../lib/gemini';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { IntentResult, WorldData, CharacterProfile, NodeData, GameState } from '../types/game';
import { normalizeConnections } from '../types/game';

/**
 * 宏观寻路：BFS 找到从当前位置到目标的下一步微操。
 * - 若玩家在屋内 → 先退出建筑
 * - 若已在目标节点 → 进入目标建筑（若有）
 * - 否则 BFS 找最短路径的下一个相邻节点
 */
export function resolveObjectivePathfinding(
  currentNodeId: string,
  currentHouseId: string | null,
  objective: NonNullable<GameState['currentObjective']>,
  nodes: NodeData[]
): IntentResult {
  const { targetNodeId, targetHouseId } = objective;

  // 1. 已经在目标节点
  if (currentNodeId === targetNodeId) {
    if (currentHouseId) {
      if (currentHouseId === targetHouseId) {
        // 已经在目标建筑里了，explore
        return { intent: 'explore', targetId: null };
      }
      // 在同节点的其他建筑里 → 先退出
      return { intent: 'move', targetId: null };
    }
    // 在目标节点野外 → 进入目标建筑
    if (targetHouseId) {
      return { intent: 'move', targetId: targetHouseId };
    }
    // 目标节点无特定建筑，explore
    return { intent: 'explore', targetId: null };
  }

  // 2. 不在目标节点，但在屋内 → 先退出建筑
  if (currentHouseId) {
    return { intent: 'move', targetId: null };
  }

  // 3. BFS 寻路到目标节点
  const adjMap = new Map<string, string[]>();
  for (const n of nodes) {
    adjMap.set(n.id, n.connections);
  }

  const visited = new Set<string>([currentNodeId]);
  // queue: [nodeId, firstStepNodeId]
  const queue: [string, string][] = [];
  for (const neighbor of adjMap.get(currentNodeId) || []) {
    visited.add(neighbor);
    queue.push([neighbor, neighbor]);
  }

  while (queue.length > 0) {
    const [nodeId, firstStep] = queue.shift()!;
    if (nodeId === targetNodeId) {
      return { intent: 'move', targetId: firstStep };
    }
    for (const neighbor of adjMap.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, firstStep]);
      }
    }
  }

  // 无路可达（不应出现），fallback
  return { intent: 'idle', targetId: null };
}

export async function generateSummary(currentSummary: string, messagesToSummarize: any[], language: 'zh' | 'en' = 'zh'): Promise<string | undefined> {
  const textToSummarize = messagesToSummarize.map(m => `${m.role}: ${m.text}`).join('\n');
  const langInstruction = language === 'zh' ? 'Translate to Chinese.' : 'Translate to English.';
  const summaryPrompt = `
    Current Summary: "${currentSummary}"
    
    New Conversation to Append:
    ${textToSummarize}
    
    Task: Update the summary to include the key events from the new conversation. Keep it concise but retain important plot points, inventory changes, and current status.
    Return ONLY the new summary text.
    ${langInstruction}
  `;

  try {
    const summaryResult = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
    });
    return summaryResult.text;
  } catch (e) {
    console.error("Summary generation failed", e);
    return undefined;
  }
}

export async function generateTurn(fullPrompt: string): Promise<any> {
  const textResult = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    config: {
      responseMimeType: 'application/json',
      
      // ⬇️ ====== 首席架构师的炼丹参数区 ====== ⬇️
      
      // 1. 创造力控制 (Temperature)：默认通常是 0.7 左右。
      // 调到 0.85 ~ 0.9 是跑团游戏的甜点区。文案会变得极其生动、比喻丰富，
      // 但又没有高到让它胡言乱语或者破坏 JSON 结构的程度。
      temperature: 0.85, 

      // 2. 逻辑兜底 (Top-P)：核采样。
      // 限制模型只能从累计概率达到 0.9 的候选词中选择。
      // 作用：配合较高的 temperature，它能“砍掉最离谱/不合逻辑的废话”，保证剧情发展不脱轨。
      topP: 0.9,

      // 3. 词汇多样性 (Top-K)：
      // 扩大候选词汇库（默认通常是 40）。调高到 60 能让 AI 使用更罕见、更具文学性的词汇，
      // 比如用“逼仄”代替“狭窄”，用“斑驳”代替“破旧”，大幅提升文本的高级感。
      topK: 60,

      // 4. 话题推进引擎 (Presence Penalty - 存在惩罚)：0.0 到 2.0
      // 设置为 0.3 可以轻微惩罚已经出现过的话题。
      // 作用：逼迫 AI 推进剧情，引导它发现新事物，而不是一直跟你扯皮“这里很危险”。

      // 5. 反复读机神器 (Frequency Penalty - 频率惩罚)：0.0 到 2.0
      // 极其关键！跑团游戏最怕 AI 词穷（比如动不动就“空气中弥漫着XX”）。
      // 设置为 0.4 会惩罚它用过的形容词，逼它换个说法，完美配合咱们之前的“防雷同”策略！
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.OFF
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.OFF
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.OFF
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.OFF
        },
      ]
    }
  });

  const responseText = textResult.text;
  if (!responseText) throw new Error("No text response");
  
  let responseJson;
  try {
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    responseJson = JSON.parse(cleanedText);
  } catch (e) {
    console.error("JSON Parse Error:", e);
    // Try to extract the first valid JSON object by matching balanced braces
    const start = responseText.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < responseText.length; i++) {
        if (responseText[i] === '{') depth++;
        else if (responseText[i] === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end !== -1) {
        try {
          responseJson = JSON.parse(responseText.slice(start, end + 1));
        } catch (e2) {
          throw new Error("Failed to parse JSON response from model.");
        }
      } else {
        throw new Error("Failed to parse JSON response from model.");
      }
    } else {
      throw new Error("Invalid JSON format from model.");
    }
  }
  return responseJson;
}

export const IMAGE_PROHIBITED_SENTINEL = '__PROHIBITED_CONTENT__';

export async function generateImage(imagePrompt: string, artStylePrompt?: string, physicalTraitsLock?: string): Promise<string | undefined> {
  // Prepend locked physical traits to ensure character consistency
const traitPrefix = physicalTraitsLock
    ? `### SUBJECT CHARACTER (The Companion - [COMPANION]) ###\nAppearance: ${physicalTraitsLock}\n\n`
    : '';
  const finalPrompt = `
    ${traitPrefix}
    ### SCENE DESCRIPTION ###
    ${imagePrompt} (Note: Whenever the companion appears, use the reference [COMPANION])
    ### MANDATORY ART STYLE ###
    ${artStylePrompt}
    `.trim();

  try {
    const imageResult = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "9:16",
          imageSize: "512px"
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.OFF
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.OFF
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.OFF
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.OFF
          },
        ]
      }
    });

    const finishReason = imageResult.candidates?.[0]?.finishReason;
    if (finishReason === 'PROHIBITED_CONTENT') {
      console.error('Image generation blocked: PROHIBITED_CONTENT', imageResult.candidates?.[0]?.finishMessage);
      return IMAGE_PROHIBITED_SENTINEL;
    }

    for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error("Image generation failed", e);
  }
  return undefined;
}

export interface InitializeWorldResult {
  worldData: WorldData;
  artStylePrompt: string;
  companionProfile: CharacterProfile & { initialAffection?: number };
  playerProfile: CharacterProfile;
}

/**
 * Unified world initialization: generates world topology, art style, and fleshes out
 * both player and companion profiles in a single PRO_MODEL request.
 */
export async function initializeWorld(
  worldview: string,
  playerProfile: CharacterProfile,
  companionProfile: CharacterProfile,
  language: 'zh' | 'en' = 'zh',
  userInput?: string
): Promise<InitializeWorldResult> {
  const langInstruction = language === 'zh' ? 'All names, descriptions, and character fields MUST be in Chinese.' : 'All content MUST be in English.';
  const userInputSection = userInput ? `\nOriginal User Input (additional context): "${userInput}"` : '';
  const or = (v: string, fallback = 'Not specified (you decide)') => v || fallback;

  const formatCharInfo = (label: string, p: CharacterProfile) => `
  ${label}:
    - Name: ${or(p.name, 'Not specified (invent a fitting one for the worldview)')}
    - Age: ${or(p.age)}
    - Gender: ${or(p.gender)}
    - Orientation: ${or(p.orientation)}
    - Skin Color: ${or(p.skinColor)}
    - Height: ${or(p.height)}
    - Weight/Build: ${or(p.weight)}
    - Personality Description: ${or(p.personalityDesc)}
    - Specialties/Skills: ${or(p.specialties)}
    - Hobbies/Interests: ${or(p.hobbies)}
    - Dislikes: ${or(p.dislikes)}`;

  const prompt = `You are an expert world builder AND character designer for a text adventure RPG.

Worldview: "${worldview}"${userInputSection}

=== CHARACTERS ===
${formatCharInfo('Player Character', playerProfile)}
${formatCharInfo('AI Companion Character', companionProfile)}

=== TASKS (complete ALL in one response) ===

**Task 1: World Topology**
Generate a complete world map with EXACTLY 10 nodes (locations) and multiple houses (buildings) within each node.
Rules:
- Each node: 1-3 houses. Connected graph (every node reachable). Types: "city"/"town"/"village"/"wilderness". House types: "housing"/"shop"/"inn"/"facility". Safety: "safe"/"low"/"medium"/"high"/"deadly".
- Node n1 MUST be a safe starting village/camp. Last few nodes should be increasingly dangerous. Connections should form branching paths, not a straight line.

**Task 2: Art Style Prompt**
Generate a concise English art style prompt describing the ideal illustration style for this world (color palette, rendering technique, lighting, influences). This will be prepended to ALL image generation.

**Task 3: Flesh Out Player Character**
Fill in all "Not specified" fields with creative values fitting the worldview. Keep user-provided values. Generate: name, age, gender, orientation, skinColor, height, weight, hairStyle, hairColor, personalityDesc, specialties, hobbies, dislikes, description, personality, background.

**Task 4: Flesh Out AI Companion Character**
Same as Task 3, PLUS generate:
- appearancePrompt: DETAILED, STABLE visual description for image generation (hair color/style, eye color, skin tone, facial features, body type, clothing with colors/materials, accessories. Physical traits MUST appear at the VERY BEGINNING).
- initialAffection: number 0-100 (how warmly they'd feel toward a stranger. Cold/hostile: 10-30. Neutral/cautious: 35-55. Friendly/warm: 55-75. Rarely above 75.)

IMPORTANT: The two characters should feel like they BELONG in this world. Their names, appearances, backgrounds should be consistent with the worldview and with each other's existence in the same universe.

${langInstruction}

Return ONLY a JSON object with this EXACT structure (no markdown):
{
  "worldData": {
    "id": "w1",
    "name": "WorldName",
    "nodes": [
      {
        "id": "n1",
        "name": "Name",
        "type": "village",
        "safetyLevel": "safe",
        "connections": ["n2"],
        "houses": [
          { "id": "h1_1", "name": "HouseName", "type": "facility", "safetyLevel": "safe" }
        ]
      }
    ]
  },
  "artStylePrompt": "A concise English art style description...",
  "playerProfile": {
    "name": "string", "age": "string", "gender": "string", "orientation": "string",
    "skinColor": "string", "height": "string", "weight": "string",
    "hairStyle": "string", "hairColor": "string",
    "personalityDesc": "string", "specialties": "string", "hobbies": "string", "dislikes": "string",
    "description": "string", "personality": "string", "background": "string"
  },
  "companionProfile": {
    "name": "string", "age": "string", "gender": "string", "orientation": "string",
    "skinColor": "string", "height": "string", "weight": "string",
    "hairStyle": "string", "hairColor": "string",
    "personalityDesc": "string", "specialties": "string", "hobbies": "string", "dislikes": "string",
    "description": "string", "personality": "string", "background": "string",
    "appearancePrompt": "string",
    "initialAffection": 50
  }
}`;

  const result = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) throw new Error("Failed to initialize world");

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate world data
  if (!parsed.worldData?.nodes || !Array.isArray(parsed.worldData.nodes) || parsed.worldData.nodes.length === 0) {
    throw new Error("Invalid world data structure");
  }

  const normalizedWorld = normalizeConnections(parsed.worldData as WorldData);

  // Ensure progress/revealed defaults for newly generated worldData
  for (const node of normalizedWorld.nodes) {
    node.progress = node.progress ?? 0;
    for (const house of node.houses) {
      house.progress = house.progress ?? 0;
      house.revealed = house.revealed ?? false;
    }
  }

  return {
    worldData: normalizedWorld,
    artStylePrompt: parsed.artStylePrompt || '',
    playerProfile: {
      ...playerProfile,
      ...parsed.playerProfile,
      isFleshedOut: true,
    },
    companionProfile: {
      ...companionProfile,
      ...parsed.companionProfile,
      isFleshedOut: true,
    },
  };
}

export async function fetchCustomLoadingMessages(worldview: string, language: 'zh' | 'en' = 'zh'): Promise<string[]> {
  const langInstruction = language === 'zh' ? 'Translate to Chinese.' : 'Translate to English.';
  const prompt = `
    Current Worldview: "${worldview}"
    
    Task: Generate 50 short, humorous, immersive "loading screen" messages related to this world theme. 
    Examples: "Connecting to neural net...", "Polishing slime...", "Calibrating gravity...". 
    Make them creative and relevant to the specific world theme.
    
    Return ONLY a JSON array of strings. No markdown formatting.
    ${langInstruction}
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
      return messages;
    }
  }
  throw new Error("Failed to generate loading messages");
}

/**
 * Step 1 of the two-step pipeline: Intent Router.
 * Uses a fast model to classify the user's action into an intent category.
 */
export async function extractIntent(
  userInput: string,
  currentNodeId: string,
  currentHouseId: string | null,
  visibleContext: string,
  connectedNodesInfo: string,
  visibleHousesInfo: string,
  currentObjectiveDesc: string | null,
  recentConversation: string,
  language: 'zh' | 'en' = 'zh',
  tensionLevel: number = 0,
  lastIntent: string | null = null,
  transitInfo: { fromName: string; toName: string; progress: number } | null = null
): Promise<IntentResult> {
  // BUG2: 求生本能（Survival Instinct）强制法则
  const survivalInstinctRule = tensionLevel >= 2
    ? `\n\n【求生本能 (Survival Instinct) - 绝对强制法则】：
当前紧张度 = ${tensionLevel}（${tensionLevel >= 3 ? '极度危险' : '危险'}状态）！上一次意图：${lastIntent || '无'}。
在 Tension >= 2 的危险状态下，玩家任何带有情绪宣泄、恐慌、反抗、惊叫、咒骂、呐喊的文本（如"卧槽！"、"你这怪物别碰我！"、"啊啊啊"、"救命"、"滚开"等），哪怕没有明确的动作动词，都必须被归类为 "combat"（挣扎求生）。
只有当玩家极其明确地表示放弃抵抗（如"我放弃了"、"我坐下等死"、"我不动了"、"随便吧"）时，才能判定为 "idle"。
任何模糊的、情绪化的、带有求生本能的表达 → 强制归类为 "combat"。`
    : '';

  // 1. 动态隔离旅途规则 (彻底消除幽灵指令干扰)
// 1. 动态隔离旅途规则 (彻底消除幽灵指令干扰)
  const transitRules = transitInfo
    ? `
**TRANSIT STATE (ACTIVE) SPECIAL RULES:**
- 玩家当前正在旅途中：从【${transitInfo.fromName}】前往【${transitInfo.toName}】，进度 ${transitInfo.progress}%。
- 如果玩家表达想退回、折返、放弃前往（如"回去"、"掉头"、"turn back"），MUST 设置 intent="move" 且 direction="back"。
- **CRITICAL**: 如果玩家显式将出发地（Origin）作为新目的地，视为折返，direction="back"。
- 如果玩家继续赶路、或者只进行普通闲聊/互动，direction 默认为 "forward"。`
    : `\n**TRANSIT STATE:** INACTIVE (Ignore direction rules, set direction to null).`;

  // 2. 终极 Prompt 组装
  const prompt = `You are a strict text adventure game engine router. Classify the player's action into ONE intent category based on the current state and conversation history.

**CURRENT STATE:**
- Current Location: Node "${currentNodeId}", House "${currentHouseId || 'outdoors'}"
- Connected Nodes: ${connectedNodesInfo || 'None'}
- Visible Houses (in current node): ${visibleHousesInfo || 'None'}
- Current Objective: ${currentObjectiveDesc || 'None'}
${transitRules}

**RECENT CONVERSATION (CRITICAL CONTEXT):**
${recentConversation || 'No prior conversation.'}

**INTENT CATEGORIES & ENGINE ROUTING RULES:**
1. "seek_quest": (MACRO TRAVEL & PROGRESSION)
   - Triggered when the player expresses a general intent to set off, progress the story, or travel toward the Current Objective (e.g., "好的，赶紧出发吧", "let's go", "去村里").
   - **TargetId Rule**: MUST set targetId to EXACTLY "current_objective". (The backend engine will intercept this flag and calculate the micro-pathfinding).
2. "move": (MICRO TRAVEL)
   - Triggered ONLY when the player explicitly names a specific, adjacent destination listed in Connected Nodes/Visible Houses (e.g., "去客厅", "去卫生间").
   - OR when they attempt to just step outside the current enclosed space without mentioning the macro-goal.
   - **TargetId Rule**: MUST use EXACTLY the Node/House ID (e.g., "n2", "h1"). If simply exiting a house to the outdoors, set targetId to "outdoors".
   - **CRITICAL BAN**: Do NOT classify vague commands like "出发" as "move" if there is an active Current Objective. Route those to "seek_quest".
3. "explore": Actively searching, inspecting, or physically interacting with objects (e.g., smashing a door, checking a smell) WITHOUT the explicit macro-intent to travel/leave.
4. "idle": Roleplaying, resting, chatting *unless* it contains a physical action or travel request.
5. "combat" / "suicidal_idle": As applicable.

**CRITICAL DISTINCTION FOR PHYSICAL ACTIONS:**
If the player interacts with a door/exit (e.g., "拉门把手", "踹门"):
- If context shows they are trying to transition to a new location/exit -> "move" (or "seek_quest" if heading to the macro-objective).
- If they are just overcoming a physical obstacle (e.g., door is jammed) or inspecting it -> "explore".

=== REAL TASK ===
Player Input: "${userInput}"

Output strictly in this JSON schema. Return ONLY JSON, no markdown formatting:
{
  "intent": "<ONE of the 5 categories above>",
  "targetId": "<EXACT ID (e.g., 'n2'), 'current_objective' if seek_quest, 'outdoors' if exiting, or null>",
  "direction": "<'forward', 'back', or null if Transit is INACTIVE>"
}`;

  const result = await ai.models.generateContent({
    model: LITE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) return { intent: 'idle', targetId: null };

  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest'];
    if (validIntents.includes(parsed.intent)) {
      const direction = parsed.direction === 'back' ? 'back' as const : parsed.direction === 'forward' ? 'forward' as const : undefined;
      return { intent: parsed.intent, targetId: parsed.targetId || null, direction };
    }
  } catch (e) {
    console.error("Intent extraction parse error, attempting regex fallback", e);
    // Regex fallback: extract first {...} block
    const braceMatch = text.match(/\{[^}]*\}/);
    if (braceMatch) {
      try {
        const fallbackParsed = JSON.parse(braceMatch[0]);
        const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest'];
        if (validIntents.includes(fallbackParsed.intent)) {
          const direction = fallbackParsed.direction === 'back' ? 'back' as const : fallbackParsed.direction === 'forward' ? 'forward' as const : undefined;
          return { intent: fallbackParsed.intent, targetId: fallbackParsed.targetId || null, direction };
        }
      } catch (e2) {
        console.error("Regex fallback also failed", e2);
      }
    }
    // Last resort: return lastIntent if available
    if (lastIntent) {
      const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest'];
      if (validIntents.includes(lastIntent)) {
        console.warn("Using lastIntent as fallback:", lastIntent);
        return { intent: lastIntent as IntentResult['intent'], targetId: null };
      }
    }
  }
  return { intent: 'idle', targetId: null };
}

/**
 * Generate a world map image based on the topology data.
 * Returns base64-encoded PNG data.
 */
export async function generateMapImage(worldData: WorldData, worldview: string, artStylePrompt?: string): Promise<string | undefined> {
  // 只保留有意义的名称和类型信息，去掉 n1, h1 等抽象 ID
  const nodeDescriptions = worldData.nodes.map(n => {
    const connNames = n.connections.map(connId => {
      const connNode = worldData.nodes.find(nn => nn.id === connId);
      return connNode?.name || '';
    }).filter(Boolean).join(', ');
    return `${n.name}(${n.type}, 危险度:${n.safetyLevel}) 连接到: ${connNames}`;
  }).join('\n');

  const styleBlock = artStylePrompt
    ? `\n\nMANDATORY ART STYLE (apply this style to the entire illustration):\n${artStylePrompt}`
    : '';

  const prompt = `Generate a highly detailed, top-down RPG world map illustration perfectly adapted to this specific universe:

World Name: "${worldData.name}"
Core Worldview & Lore: "${worldview}"

Geographical Nodes & Connections:
${nodeDescriptions}

Art Style & Rendering Instructions:
1. STRICT AESTHETIC MATCH: The visual style MUST strictly reflect the "Core Worldview". (e.g., If the lore is Sci-Fi, use holographic/neon blueprint aesthetics; if Post-Apocalyptic, use a gritty, weathered survivalist paper style; if Dark Fantasy, use ancient, worn parchment with gothic ink).
2. TOPOLOGY & ICONS: Clearly depict the locations as distinct nodes. Use specific architectural markers based on their types (dense buildings for 'city', scattered structures for 'town/village', terrain hazards/nature for 'wilderness'). 
3. CONNECTIVITY: Draw clear, stylized routes, roads, or paths connecting the connected nodes.
4. VIEWPOINT & VIBE: Bird's-eye view, atmospheric, immersive. Designed as a functional UI map screen for a sandbox RPG. Include stylized map pins/markers for locations.${styleBlock}`;

  try {
    const imageResult = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "2K"
        }
      }
    });

    for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error("Map image generation failed", e);
  }
  return undefined;
}

/**
 * Generate a 1:1 512px portrait photo for the AI character.
 */
export async function generateCharacterPortrait(appearancePrompt: string, worldview: string, artStylePrompt?: string): Promise<string | undefined> {
  const styleBlock = artStylePrompt
    ? `\n\nMANDATORY ART STYLE (apply this style to the portrait):\n${artStylePrompt}`
    : '';

  const prompt = `Generate a high-quality character portrait ID photo (bust shot, facing forward, neutral background).

Character Visual Description: ${appearancePrompt}

World Setting: ${worldview}

Style: Semi-realistic anime/illustration style. Clean lighting, sharp details. The character should look directly at the camera. Background should be simple and non-distracting.${styleBlock}`;

  try {
    const imageResult = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "512px"
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
        ]
      }
    });

    for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error("Character portrait generation failed", e);
  }
  return undefined;
}
