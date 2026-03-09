import { ai, TEXT_MODEL, IMAGE_MODEL } from '../lib/gemini';

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
    model: TEXT_MODEL,
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
