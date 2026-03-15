import { ai, TEXT_MODEL, PRO_MODEL, PRO_IMAGE_MODEL, IMAGE_MODEL, LITE_MODEL } from '../lib/gemini';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { IntentResult, WorldData, CharacterProfile, NodeData, GameState, InventoryItem, Rarity, SafetyLevel } from '../types/game';
import { normalizeConnections, EQUIPMENT_BUFF_TABLE } from '../types/game';

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
 * 生成装备预设池：25 武器 + 25 防具（每稀有度各 5 件）
 * buff 值来自 EQUIPMENT_BUFF_TABLE
 */
export async function generateEquipmentPresets(
  worldview: string,
  language: 'zh' | 'en' = 'zh'
): Promise<InventoryItem[]> {
  const langInstruction = language === 'zh' ? 'All names and descriptions MUST be in Chinese.' : 'All content MUST be in English.';
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  const prompt = `You are an expert RPG item designer.

Worldview: "${worldview}"

Generate equipment items for this world. You need to create:
- 25 WEAPONS (5 per rarity tier)
- 25 ARMOR pieces (5 per rarity tier)

Rarity tiers: common, uncommon, rare, epic, legendary

For each item, provide:
- name: A creative, worldview-fitting name
- description: A short 1-sentence description of the item's lore/appearance
- icon: A single emoji that represents the weapon or armor piece

IMPORTANT: Items must feel like they belong in this specific world. A cyberpunk world should have plasma rifles and nano-armor, not medieval swords.

${langInstruction}

Return ONLY a JSON object with this structure (no markdown):
{
  "weapons": {
    "common": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "uncommon": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "rare": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "epic": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "legendary": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items]
  },
  "armors": {
    "common": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "uncommon": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "rare": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "epic": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "legendary": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items]
  }
}`;

  const result = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) throw new Error('Failed to generate equipment presets');

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const items: InventoryItem[] = [];
  let idCounter = 0;

  for (const equipType of ['weapons', 'armors'] as const) {
    const itemType: 'weapon' | 'armor' = equipType === 'weapons' ? 'weapon' : 'armor';
    for (const rarity of rarities) {
      const buffValues = EQUIPMENT_BUFF_TABLE[rarity];
      const rawItems = parsed[equipType]?.[rarity] || [];
      for (let i = 0; i < Math.min(5, rawItems.length); i++) {
        const raw = rawItems[i];
        items.push({
          id: `eq_${itemType}_${rarity}_${idCounter++}`,
          name: raw.name || `Unknown ${itemType}`,
          type: itemType,
          description: raw.description || '',
          rarity,
          icon: raw.icon || (itemType === 'weapon' ? '⚔️' : '🛡️'),
          quantity: 1,
          buff: buffValues[i] ?? buffValues[0],
        });
      }
    }
  }

  return items;
}

/**
 * 生成任务链（3-5 环）+ 每环所需道具
 */
export async function generateQuestChain(
  worldview: string,
  worldData: WorldData,
  currentNodeId: string,
  language: 'zh' | 'en' = 'zh'
): Promise<{ stages: Array<{ description: string; requiredItems: { name: string; id: string }[] }>, targetLocations: { nodeId: string; houseId: string; locationName: string }[] }> {
  const langInstruction = language === 'zh' ? 'All text MUST be in Chinese.' : 'All content MUST be in English.';

  // Pick 3-5 target locations (TS side, no adjacent repeats)
  // Include both node-level (outdoors) and house-level targets
  const stageCount = 3 + Math.floor(Math.random() * 3); // 3-5

  const allTargets: { nodeId: string; houseId: string; locationName: string; nodeName: string; locationType: string; safety: SafetyLevel }[] = [];

  for (const n of worldData.nodes) {
    if (n.id === currentNodeId) continue;
    // Node-level target (outdoors)
    allTargets.push({
      nodeId: n.id, houseId: '', locationName: n.name,
      nodeName: n.name, locationType: n.type, safety: n.safetyLevel,
    });
    // House-level targets
    for (const h of n.houses) {
      allTargets.push({
        nodeId: n.id, houseId: h.id, locationName: `${n.name} · ${h.name}`,
        nodeName: n.name, locationType: h.type, safety: n.safetyLevel,
      });
    }
  }

  const targetLocations: typeof allTargets = [];
  for (let i = 0; i < stageCount && allTargets.length > 0; i++) {
    const candidates = allTargets.filter(t =>
      targetLocations.length === 0 || t.nodeId !== targetLocations[targetLocations.length - 1].nodeId
    );
    const pool = candidates.length > 0 ? candidates : allTargets;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    targetLocations.push(pick);
  }

  const locationDesc = targetLocations.map((t, i) =>
    `Stage ${i + 1}: ${t.locationName} (${t.locationType}, danger: ${t.safety})`
  ).join('\n');

  const prompt = `You are a quest designer for an RPG text adventure.

Worldview: "${worldview}"

The player needs a quest chain with ${targetLocations.length} stages. For each stage, the player must travel to a specific location and use the correct quest item there.

Target Locations (pre-assigned):
${locationDesc}

For each stage, generate:
1. description: A vivid, specific quest objective description (2-3 sentences explaining WHY the player needs to go there and WHAT they need to accomplish)
2. requiredItem: EXACTLY ONE quest item needed for this stage. The item has a name and a brief description.

IMPORTANT: Each stage must have EXACTLY ONE required item, no more, no less.

Make the quest chain tell a coherent escalating story across all stages.

${langInstruction}

Return ONLY a JSON object (no markdown):
{
  "stages": [
    {
      "description": "stage objective description...",
      "requiredItem": { "name": "item name", "description": "item description" }
    }
  ]
}`;

  const result = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) throw new Error('Failed to generate quest chain');

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  let itemIdCounter = 0;
  const stages = (parsed.stages || []).map((s: any, i: number) => {
    // Support both requiredItem (single) and requiredItems (array) from AI
    const item = s.requiredItem || (s.requiredItems && s.requiredItems[0]) || { name: `任务道具 ${i + 1}` };
    return {
      description: s.description || `前往目标地点 ${i + 1}`,
      requiredItems: [{
        name: item.name || `任务道具 ${itemIdCounter}`,
        id: `quest_item_${itemIdCounter++}`,
      }],
    };
  });

  return {
    stages,
    targetLocations: targetLocations.map(t => ({ nodeId: t.nodeId, houseId: t.houseId, locationName: t.locationName })),
  };
}

/**
 * 任务完成旁白：由 AI 生成一段颁奖式的任务完成叙述
 */
export async function generateQuestCompletionNarration(
  worldview: string,
  questDescription: string,
  companionName: string,
  language: 'zh' | 'en' = 'zh'
): Promise<string> {
  const langInstruction = language === 'zh' ? '用中文回复。' : 'Reply in English.';
  const prompt = `You are the narrator of an RPG text adventure. The player and their companion ${companionName} have just completed a multi-stage quest chain.

Worldview: "${worldview}"
Completed Quest: "${questDescription}"

Write a short (2-3 sentences), dramatic, third-person narrator passage celebrating the completion of this quest chain. Be poetic but concise. Do NOT use dialogue — it's pure narration.

${langInstruction}

Return ONLY the narrator text, no JSON, no markdown.`;

  try {
    const result = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    return result.text?.trim() || '任务链已完成。新的冒险即将开始。';
  } catch (e) {
    console.error('Quest completion narration failed:', e);
    return '任务链已完成。新的冒险即将开始。';
  }
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
**TRANSIT STATE (ACTIVE):**
- Traveling from [${transitInfo.fromName}] to [${transitInfo.toName}], Progress: ${transitInfo.progress}%.
- **DIRECTION RULE**: If the player explicitly wants to retreat, turn back, or abort (e.g., "回去", "掉头", "退回出发地"), set direction="back". For normal chatting, exploring, or continuing the journey, set direction="forward".`
    : `\n**TRANSIT STATE:** INACTIVE (Ignore direction rules, set direction to null).`;

  // 2. 终极 Prompt 组装 (Architectural Router Prompt)
  const prompt = `You are the core logic router of a strict text adventure game engine. Your ONLY job is to classify the player's true intent based on the Current State, Spatial Context, and Conversation History.

**CURRENT STATE:**
- Current Location: Node "${currentNodeId}", House "${currentHouseId || 'outdoors'}"
- Connected Nodes: ${connectedNodesInfo || 'None'}
- Visible Houses (in current node): ${visibleHousesInfo || 'None'}
- Current Objective: ${currentObjectiveDesc || 'None'}
${transitRules}

**RECENT CONVERSATION (CRITICAL CONTEXT):**
${recentConversation || 'No prior conversation.'}

**INTENT RESOLUTION PIPELINE (STRICT WATERFALL RULES):**
You MUST evaluate the player's input through this top-down pipeline. Match the FIRST applicable rule and IGNORE the rest.

**STEP 1: MICRO-SPACE EXIT (The "Get me out of here" Rule)**
- **Condition**: Current House is NOT 'outdoors' AND player expresses physical spatial exit (e.g., "出去吧", "离开这", "出屋", "let's go out").
- **Intent**: "move"
- **TargetId**: "outdoors"
- *Architect Note*: Even if they just finished a quest objective inside, the physical act of stepping outside the enclosure takes absolute priority. DO NOT route to seek_quest.

**STEP 2: EXPLICIT DESTINATION (The "Map Navigation" Rule)**
- **Condition**: Player explicitly names a specific target present in Connected Nodes or Visible Houses (e.g., "去浅层孢子林", "进装甲车").
- **Intent**: "move"
- **TargetId**: <The exact Node ID or House ID>

**STEP 3: MACRO PROGRESSION (The "Journey/Objective" Rule)**
- **Condition**: Player explicitly mentions heading to the Current Objective, OR uses vague journey verbs (e.g., "出发", "继续赶路", "let's hit the road") while already 'outdoors' or ready to move on.
- **Intent**: "seek_quest"
- **TargetId**: "current_objective" (The backend engine handles the pathfinding).
**STEP 4.5: ITEM USAGE (The "Use Item" Rule)**
- **Condition**: Player explicitly attempts to use, activate, or deploy an item from their backpack (e.g., "使用XXX", "用这个道具", "activate the shield", "吃药").
- **Intent**: "use_item"
- **TargetId**: null
- **itemName**: The name of the item player wants to use.
**STEP 4: PHYSICAL INTERACTION & EXPLORATION (The "Hands-on" Rule)**
- **Condition**: Player acts on the immediate environment (e.g., "搜刮尸体", "踹门", "检查箱子") WITHOUT intending to travel away.
- **Intent**: "explore"
- **TargetId**: null

**STEP 6: ROLEPLAY & STANDBY (The "Idle" Rule)**
- **Condition**: Pure conversation, emotional reactions, resting, or observations without physical progression.
- **Intent**: "idle" (or "combat" / "suicidal_idle" if heavily applicable)
- **TargetId**: null

=== REAL TASK ===
Player Input: "${userInput}"

Output strictly in this JSON schema. Return ONLY JSON, no markdown formatting:
{
  "intent": "<ONE of the categories above>",
  "targetId": "<EXACT ID (e.g., 'n2'), 'current_objective' if seek_quest, 'outdoors' if exiting, or null>",
  "direction": "<'forward', 'back', or null>",
  "itemName": "<Name of item to use, or null if not use_item intent>"
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
    const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest', 'use_item'];
    if (validIntents.includes(parsed.intent)) {
      const direction = parsed.direction === 'back' ? 'back' as const : parsed.direction === 'forward' ? 'forward' as const : undefined;
      return { intent: parsed.intent, targetId: parsed.targetId || null, direction, itemName: parsed.itemName || undefined };
    }
  } catch (e) {
    console.error("Intent extraction parse error, attempting regex fallback", e);
    // Regex fallback: extract first {...} block
    const braceMatch = text.match(/\{[^}]*\}/);
    if (braceMatch) {
      try {
        const fallbackParsed = JSON.parse(braceMatch[0]);
        const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest', 'use_item'];
        if (validIntents.includes(fallbackParsed.intent)) {
          const direction = fallbackParsed.direction === 'back' ? 'back' as const : fallbackParsed.direction === 'forward' ? 'forward' as const : undefined;
          return { intent: fallbackParsed.intent, targetId: fallbackParsed.targetId || null, direction, itemName: fallbackParsed.itemName || undefined };
        }
      } catch (e2) {
        console.error("Regex fallback also failed", e2);
      }
    }
    // Last resort: return lastIntent if available
    if (lastIntent) {
      const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest', 'use_item'];
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
