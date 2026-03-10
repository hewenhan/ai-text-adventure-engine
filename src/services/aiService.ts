import { ai, TEXT_MODEL, PRO_MODEL, PRO_IMAGE_MODEL, IMAGE_MODEL, LITE_MODEL } from '../lib/gemini';
import type { IntentResult, WorldData } from '../types/game';

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
    config: { responseMimeType: 'application/json' }
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

export async function generateImage(imagePrompt: string): Promise<string | undefined> {
  try {
    const imageResult = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "9:16",
          imageSize: "512px"
        }
      }
    });

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

export async function fleshOutCharacterProfile(worldview: string, baseName: string, baseGender: string, baseDesc: string, language: 'zh' | 'en' = 'zh'): Promise<any> {
  const langInstruction = language === 'zh' ? 'Translate all content to Chinese.' : 'Translate all content to English.';
  const prompt = `
    You are an expert character designer for a roleplay game.
    
    Worldview: "${worldview}"
    Initial Character Info:
    Name: ${baseName || 'Not specified'}
    Gender: ${baseGender || 'Not specified'}
    Description: ${baseDesc || 'Not specified'}
    
    Task: Flesh out this character to fit perfectly into the worldview.
    Provide a complete profile including:
    1. Name (use the initial name if provided, otherwise invent a fitting one)
    2. Gender (use the initial gender if provided, otherwise invent a fitting one)
    3. Description (a short summary of who they are)
    4. Personality (their traits, quirks, how they act)
    5. Background (their past experiences, how they got here)
    6. Hobbies/Skills (what they are good at, what they like to do)
    
    Return ONLY a JSON object with this structure:
    {
      "name": "string",
      "gender": "string",
      "description": "string",
      "personality": "string",
      "background": "string",
      "hobbies": "string"
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
  connectedNodeIds: string[],
  language: 'zh' | 'en' = 'zh'
): Promise<IntentResult> {
  const prompt = `You are an intent classifier for a text adventure game. Classify the player's action into ONE intent category.

Current Location: Node "${currentNodeId}", House "${currentHouseId || 'outdoors'}"
Visible Environment: ${visibleContext}
Connected Nodes the player can move to: ${connectedNodeIds.join(', ')}

Player Input: "${userInput}"

Intent Categories:
- "idle": Resting, chatting, socializing, examining self, non-action activities
- "explore": Searching, investigating, looting, opening containers, examining surroundings
- "combat": Fighting, attacking, using weapons, defending against threats
- "suicidal_idle": Reckless/self-destructive behavior in a dangerous area
- "move": Any movement to a different location (includes retreat, fleeing, traveling). You MUST extract the target node/house ID if mentioned.

Return ONLY a JSON object: { "intent": "idle|explore|combat|suicidal_idle|move", "targetId": "nodeId_or_null" }
If the player wants to move but doesn't specify a clear connected destination, set targetId to null.
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
    const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move'];
    if (validIntents.includes(parsed.intent)) {
      return { intent: parsed.intent, targetId: parsed.targetId || null };
    }
  } catch (e) {
    console.error("Intent extraction parse error", e);
  }
  return { intent: 'idle', targetId: null };
}

/**
 * Phase 0: Generate complete world topology data (10 nodes with houses).
 * Called once during game initialization.
 */
export async function generateWorldData(worldview: string, language: 'zh' | 'en' = 'zh'): Promise<WorldData> {
  const langInstruction = language === 'zh' ? 'All names and descriptions MUST be in Chinese.' : 'All names and descriptions MUST be in English.';
  const prompt = `You are an expert world builder for a text adventure RPG.

Worldview: "${worldview}"

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

${langInstruction}

Return ONLY a JSON object with this EXACT structure (no markdown):
{
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

  return parsed as WorldData;
}

/**
 * Generate a world map image based on the topology data.
 * Returns base64-encoded PNG data.
 */
export async function generateMapImage(worldData: WorldData, worldview: string): Promise<string | undefined> {
  const nodeDescriptions = worldData.nodes.map(n =>
    `${n.name}(${n.type}, ${n.safetyLevel}) 连接: ${n.connections.join(', ')}`
  ).join('\n');

  const prompt = `Generate a highly detailed, top-down RPG world map illustration perfectly adapted to this specific universe:

World Name: "${worldData.name}"
Core Worldview & Lore: "${worldview}"

Geographical Nodes & Connections:
${nodeDescriptions}

Art Style & Rendering Instructions:
1. STRICT AESTHETIC MATCH: The visual style MUST strictly reflect the "Core Worldview". (e.g., If the lore is Sci-Fi, use holographic/neon blueprint aesthetics; if Post-Apocalyptic, use a gritty, weathered survivalist paper style; if Dark Fantasy, use ancient, worn parchment with gothic ink).
2. TOPOLOGY & ICONS: Clearly depict the locations as distinct nodes. Use specific architectural markers based on their types (dense buildings for 'city', scattered structures for 'town/village', terrain hazards/nature for 'wilderness'). 
3. CONNECTIVITY: Draw clear, stylized routes, roads, or paths connecting the connected nodes.
4. VIEWPOINT & VIBE: Bird's-eye view, atmospheric, immersive. Designed as a functional UI map screen for a sandbox RPG. Include stylized map pins/markers for locations.`;

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
