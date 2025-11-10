import { defineTool } from '@genkit-ai/tool';
import { geminiPro } from '@genkit-ai/googleai';
import { z } from 'zod';

// This tool improves RAG quality by using an LLM to re-rank search results
// based on relevance to the user's query.

export const fewShotRerankerTool = defineTool(
  {
    name: 'few_shot_reranker',
    description: 'Re-ranks a list of retrieved document chunks for relevance.',
    inputSchema: z.object({
        query: z.string(),
        documents: z.array(z.object({ id: z.string(), text: z.string() })),
    }),
    outputSchema: z.array(z.object({ id: z.string(), text: z.string(), score: z.number() })),
  },
  async (input) => {
    const scoredDocs = await Promise.all(
      input.documents.map(async (doc) => {
        // A real few-shot prompt would be stored in a Canvas asset.
        const scoringPrompt = `
            Score the relevance of the following document to the user query on a scale of 0.0 to 1.0.
            
            USER QUERY: "What is the Reflexion pattern in AI?"
            DOCUMENT: "The core components of an agent often include Perception and Planning."
            SCORE: 0.6

            USER QUERY: "What is the Reflexion pattern in AI?"
            DOCUMENT: "A key pattern is the Reflexion loop, where an agent critiques its own work to improve."
            SCORE: 1.0
            ---
            USER QUERY: "${input.query}"
            DOCUMENT: "${doc.text}"
            SCORE:
        `;
        
        const response = await geminiPro.generate({
            prompt: scoringPrompt,
            config: { temperature: 0, stopSequences: ['\n'] }
        });

        const score = parseFloat(response.text().trim());
        return { ...doc, score: isNaN(score) ? 0 : score };
      })
    );

    return scoredDocs.sort((a, b) => b.score - a.score);
  }
);
