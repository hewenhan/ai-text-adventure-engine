import { ai, TEXT_MODEL, PRO_MODEL, PRO_IMAGE_MODEL, IMAGE_MODEL, LITE_MODEL } from '../lib/gemini';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { IntentResult, WorldData } from '../types/game';
import { normalizeConnections } from '../types/game';

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
    ? `[LOCKED CHARACTER PHYSICAL TRAITS - MUST MATCH EXACTLY]: ${physicalTraitsLock}\n\n`
    : '';
  const finalPrompt = artStylePrompt
    ? `${traitPrefix}${imagePrompt}\n\nMANDATORY ART STYLE (apply this style to the entire image):\n${artStylePrompt}`
    : `${traitPrefix}${imagePrompt}`;
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

export async function fleshOutCharacterProfile(worldview: string, baseName: string, baseGender: string, baseDesc: string, language: 'zh' | 'en' = 'zh', aiCharacterSetup?: { age?: string; skinColor?: string; height?: string; weight?: string; specialties?: string; hobbies?: string; dislikes?: string; orientation?: string; hairStyle?: string; hairColor?: string }): Promise<any> {
  const langInstruction = language === 'zh' ? 'Translate all content to Chinese.' : 'Translate all content to English.';
  
  const physicalTraits = aiCharacterSetup
    ? `
    Physical Traits (MUST be included verbatim in appearancePrompt):
    - Age: ${aiCharacterSetup.age || 'Not specified (you decide)'}
    - Skin Color: ${aiCharacterSetup.skinColor || 'Not specified (you decide)'}
    - Height: ${aiCharacterSetup.height || 'Not specified (you decide)'}
    - Weight/Build: ${aiCharacterSetup.weight || 'Not specified (you decide)'}
    - Orientation: ${aiCharacterSetup.orientation || 'Not specified (you decide)'}
    Specialties/Skills: ${aiCharacterSetup.specialties || 'Not specified (you decide)'}
    Hobbies/Interests: ${aiCharacterSetup.hobbies || 'Not specified (you decide)'}
    Dislikes: ${aiCharacterSetup.dislikes || 'Not specified (you decide)'}`
    : '';

  const prompt = `
    You are an expert character designer for a roleplay game.
    
    Worldview: "${worldview}"
    Initial Character Info:
    Name: ${baseName || 'Not specified (invent a fitting one for the worldview)'}
    Gender: ${baseGender || 'Not specified (you decide)'}
    Description: ${baseDesc || 'Not specified (you decide)'}${physicalTraits}
    
    Task: Flesh out this character to fit perfectly into the worldview. If any fields are "Not specified", use your creativity to invent appropriate values that fit the worldview.
    Provide a complete profile including:
    1. Name (use the initial name if provided, otherwise invent a fitting one)
    2. Gender (use the initial gender if provided, otherwise invent a fitting one)
    3. Description (a short summary of who they are)
    4. Personality (their traits, quirks, how they act)
    5. Background (their past experiences, how they got here)
    6. Specialties (what they are GOOD AT, their skills, expertise, combat abilities — practical things. If user provided specialties, use them and expand.)
    7. Hobbies (what they ENJOY doing in their free time, interests, pastimes — leisure things. If user provided hobbies, use them and expand.)
    8. Dislikes (things they hate, dislike, or can't stand. If user provided dislikes, use them and expand.)
    9. Hair Style (specific hair style, e.g. "long wavy hair", "short pixie cut", "twin tails", "buzz cut")
    10. Hair Color (specific hair color, e.g. "jet black", "platinum blonde", "cherry red", "silver-white")
    11. Appearance Prompt (a DETAILED, STABLE visual description of the character's physical appearance and outfit for image generation. Include: hair color/style, eye color, skin tone, facial features, body type, specific clothing items with colors and materials, accessories. This will be used as a fixed prompt for ALL future image generation involving this character. Be extremely specific and consistent. CRITICAL: The physical traits provided above (age, skin color, height, weight) plus the hair style and hair color MUST appear at the VERY BEGINNING of the appearancePrompt and must match exactly.)
    
    Return ONLY a JSON object with this structure:
    {
      "name": "string",
      "gender": "string",
      "description": "string",
      "personality": "string",
      "background": "string",
      "specialties": "string",
      "hobbies": "string",
      "dislikes": "string",
      "hairStyle": "string",
      "hairColor": "string",
      "appearancePrompt": "string"
    }
    
    ${langInstruction}
    No markdown formatting.
  `;
  
  const result = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  const text = result.text;
  if (text) {
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  }
  throw new Error("Failed to generate character profile");
}

export async function fleshOutPlayerProfile(worldview: string, playerProfile: { name?: string; age?: string; gender?: string; orientation?: string; skinColor?: string; height?: string; weight?: string; personalityDesc?: string }, language: 'zh' | 'en' = 'zh'): Promise<{ name: string; age: string; personalityDesc: string; hairStyle: string; hairColor: string }> {
  const langInstruction = language === 'zh' ? 'Translate all content to Chinese.' : 'Translate all content to English.';
  const prompt = `
    You are an expert character designer for a roleplay game.
    
    Worldview: "${worldview}"
    Player Character Info:
    - Name: ${playerProfile.name || 'Not specified (invent a fitting one for the worldview)'}
    - Age: ${playerProfile.age || 'Not specified (you decide)'}
    - Gender: ${playerProfile.gender || 'Not specified'}
    - Orientation: ${playerProfile.orientation || 'Not specified'}
    - Skin Color: ${playerProfile.skinColor || 'Not specified (you decide)'}
    - Height: ${playerProfile.height || 'Not specified (you decide)'}
    - Weight/Build: ${playerProfile.weight || 'Not specified (you decide)'}
    - Personality: ${playerProfile.personalityDesc || 'Not specified (you decide)'}
    
    Task: Fill in any missing/empty fields for the PLAYER character to fit the worldview. Keep all provided values unchanged.
    
    Return ONLY a JSON object:
    {
      "name": "string (use provided if given, else invent)",
      "age": "string (use provided if given, else invent, e.g. '24岁')",
      "personalityDesc": "string (use provided if given, else invent a brief personality)",
      "hairStyle": "string (invent a specific hair style)",
      "hairColor": "string (invent a specific hair color)"
    }
    
    ${langInstruction}
    No markdown formatting.
  `;
  
  const result = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });
  const text = result.text;
  if (text) {
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  }
  throw new Error("Failed to flesh out player profile");
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
  lastIntent: string | null = null
): Promise<IntentResult> {
  // BUG2: 求生本能（Survival Instinct）强制法则
  const survivalInstinctRule = tensionLevel >= 2
    ? `\n\n【求生本能 (Survival Instinct) - 绝对强制法则】：
当前紧张度 = ${tensionLevel}（${tensionLevel >= 3 ? '极度危险' : '危险'}状态）！上一次意图：${lastIntent || '无'}。
在 Tension >= 2 的危险状态下，玩家任何带有情绪宣泄、恐慌、反抗、惊叫、咒骂、呐喊的文本（如"卧槽！"、"你这怪物别碰我！"、"啊啊啊"、"救命"、"滚开"等），哪怕没有明确的动作动词，都必须被归类为 "combat"（挣扎求生）。
只有当玩家极其明确地表示放弃抵抗（如"我放弃了"、"我坐下等死"、"我不动了"、"随便吧"）时，才能判定为 "idle"。
任何模糊的、情绪化的、带有求生本能的表达 → 强制归类为 "combat"。`
    : '';

  const prompt = `You are an intent classifier for a text adventure game. Classify the player's action into ONE intent category.

Current Location: Node "${currentNodeId}", House "${currentHouseId || 'outdoors'}"
Visible Environment: ${visibleContext}
Connected Nodes: ${connectedNodesInfo}
Visible Houses: ${visibleHousesInfo}
Current Tension Level: ${tensionLevel}
Current Objective: ${currentObjectiveDesc || '\u65e0 (None - \u73a9\u5bb6\u5f53\u524d\u6f2b\u65e0\u76ee\u7684\uff0c\u82e5\u63d0\u8bae\u53bb\u672a\u77e5\u8fdc\u5904\uff0c\u8bf7\u52a1\u5fc5\u5224\u5b9a\u4e3a seek_quest)'}

Recent Conversation Context (for understanding intent continuity):
${recentConversation || 'No prior conversation.'}
${survivalInstinctRule}

Intent Categories:
- "seek_quest": [HIGHEST PRIORITY] The player suggests, demands, or mentions traveling to a MACRO-DESTINATION (e.g., Internet Cafe, School, Hospital) that is ABSENT from the "Connected Nodes" and "Visible Houses" lists. EVEN IF the sentence is wrapped in a joke, a bet, or complaining about being sleepy/bored, IF it contains a request to go to a NEW UNLISTED place, you MUST choose seek_quest.
- "idle": Roleplaying, resting, chatting, eating/drinking in the current location.[CRITICAL EXCLUSION: If the text contains ANY suggestion to go to a macro-destination not on the lists, DO NOT choose idle. Action overrides chatting.]
- "explore": Actively searching, investigating, looting, OR aimless wandering/scouting within the CURRENT area to find new things.
- "combat": Fighting, attacking, using weapons, defending against threats.${tensionLevel >= 2 ? ' [BOOSTED PRIORITY at high tension: emotional outbursts, panic, resistance = combat]' : ''}
- "suicidal_idle": Reckless/self-destructive behavior in a dangerous area.
- "move": Traveling ONLY to a destination explicitly listed in "Connected Nodes" or "Visible Houses".

=== EXAMPLES (LEARN FROM THESE) ===
Example 1:
Visible Environment: 露天小龙虾摊
Connected Nodes: n2 (城中村老区), n3 (百脑汇电脑城)
Player Input: "天快亮了，再去网吧验证咱们的赌局我就睡着啦！"
Output: {"intent": "seek_quest", "targetId": null}
(Reason: "网吧" is a macro-destination NOT in the connected lists. The chatting/bet context is overridden by the travel request.)

Example 2:
Player Input: "老板，这龙虾太辣了，我去旁边买瓶水。"
Output: {"intent": "idle", "targetId": null}
(Reason: Micro-flavor roleplaying in the immediate area. Not leaving the macro-node.)

Example 3:
Player Input: "别磨叽了，直接去城中村老区！"
Output: {"intent": "move", "targetId": "n2"}
(Reason: Explicitly moving to a connected node list.)

=== REAL TASK ===
Player Input: "${userInput}"

Return ONLY a JSON object: { "intent": "idle|explore|combat|suicidal_idle|move|seek_quest", "targetId": "nodeId_or_houseId_or_null" }
IMPORTANT: If targetId is null, use the literal null value (targetId: null), NOT the string "null".
No markdown formatting.`;

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
      return { intent: parsed.intent, targetId: parsed.targetId || null };
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
          return { intent: fallbackParsed.intent, targetId: fallbackParsed.targetId || null };
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
 * Phase 0: Generate complete world topology data (10 nodes with houses).
 * Called once during game initialization.
 */
export async function generateWorldData(worldview: string, language: 'zh' | 'en' = 'zh', userInput?: string): Promise<{ worldData: WorldData; artStylePrompt: string }> {
  const langInstruction = language === 'zh' ? 'All names and descriptions MUST be in Chinese.' : 'All names and descriptions MUST be in English.';
  const userInputSection = userInput ? `\n\nOriginal User Input (use this as additional context for more accurate world building): "${userInput}"` : '';
  const prompt = `You are an expert world builder for a text adventure RPG.

Worldview: "${worldview}"${userInputSection}

Task: Generate a complete topology map for this world with EXACTLY 10 nodes (locations) and multiple houses (buildings/places) within each node.

RULES:
- Each node must have 1-3 houses.
- Nodes must form a connected graph (every node reachable from every other node via connections).
- Node types: "city", "town", "village", "wilderness"
- House types: "housing", "shop", "inn", "facility"
- Safety levels: "safe", "low", "medium", "high", "deadly"
- The first node (n1) MUST be a safe starting village/camp.
- The last few nodes should be increasingly dangerous (high/deadly).
- Connections should form a branching path, not a straight line.

ADDITIONAL TASK - Art Style Prompt:
Based on the worldview, generate a short but precise "art style prompt" (in English) that describes the ideal illustration style for this world. This prompt will be prepended to ALL image generation requests (maps, character portraits, scene illustrations) to ensure a unified visual style throughout the game.
Consider: color palette, rendering technique (e.g., watercolor, cel-shaded, oil painting, pixel art, digital painting), lighting mood, level of detail, art influences or references.
Example: "Dark gothic oil painting style, muted desaturated colors with deep crimson accents, dramatic chiaroscuro lighting, intricate pen-and-ink linework, reminiscent of Berserk manga and Castlevania concept art"

${langInstruction}

Return ONLY a JSON object with this EXACT structure (no markdown):
{
  "id": "w1",
  "name": "WorldName",
  "artStylePrompt": "A concise English art style description for unified visual generation...",
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
}`;

  const result = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) throw new Error("Failed to generate world data");

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate basic structure
  if (!parsed.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    throw new Error("Invalid world data structure");
  }

  // Extract artStylePrompt and return it separately
  const artStylePrompt: string = parsed.artStylePrompt || '';
  delete parsed.artStylePrompt;

  // 归一化双向连接（AI 可能只生成单向连接）
  const normalized = normalizeConnections(parsed as WorldData);

  return { worldData: normalized, artStylePrompt };
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
