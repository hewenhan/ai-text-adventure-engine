import { GoogleGenAI } from "@google/genai";

// Initialize Gemini API
// Note: We use the server-side key for text generation if possible, but for client-side app logic 
// without a proxy, we use the injected process.env.GEMINI_API_KEY.
// The prompt instructions say "Always call Gemini API from the frontend code".
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Models
export const TEXT_MODEL = "gemini-3-flash-preview";
export const PRO_MODEL = "gemini-3.1-pro-preview";
export const PRO_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
export const LITE_MODEL = "gemini-2.5-flash-lite-preview-09-2025";
