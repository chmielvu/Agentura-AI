
import { GenerateContentResponse, Part } from "@google/genai";
import { FileData, GroundingSource } from "../../types";

export const fileToGenerativePart = (file: FileData): Part => ({
  inlineData: { data: file.content, mimeType: file.type },
});

export const readFileAsBase64 = (file: File): Promise<FileData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({ name: file.name, type: file.type, content: base64String });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

export const extractSources = (chunk: GenerateContentResponse): GroundingSource[] => {
  const metadata = chunk.candidates?.[0]?.groundingMetadata;
  if (!metadata?.groundingChunks) { return []; }
  return metadata.groundingChunks
    .map(c => c.web)
    .filter((web): web is { uri: string, title: string } => !!web?.uri)
    .map(web => ({ uri: web.uri, title: web.title || '' }));
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * backoff, backoff);
  }
}

export const safeParseJSON = <T>(text: string): T | null => {
    try {
        // Attempt to find JSON in markdown code blocks
        const match = text.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonStr = match ? match[1] : text;
        return JSON.parse(jsonStr) as T;
    } catch (e) {
        console.warn("Failed to parse JSON:", e);
        return null;
    }
};
