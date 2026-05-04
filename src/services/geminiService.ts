import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

export async function generateContent(systemInstruction: string, prompt: string, model: string = "gemini-3-flash-preview"): Promise<string> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      systemInstruction,
    },
  });
  return response.text || "";
}

export async function generateContentStream(systemInstruction: string, prompt: string, onChunk: (text: string) => void, model: string = "gemini-3-flash-preview"): Promise<void> {
  const ai = getGenAI();
  const responseStream = await ai.models.generateContentStream({
    model,
    contents: prompt,
    config: {
      systemInstruction,
    },
  });
  
  for await (const chunk of responseStream) {
    if (chunk.text) {
      onChunk(chunk.text);
    }
  }
}

export async function generateSpeech(prompt: string): Promise<string> {
  const ai = getGenAI();
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-tts-preview",
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio || "";
}
