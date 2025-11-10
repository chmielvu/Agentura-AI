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
