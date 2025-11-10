import { defineTool } from '@genkit-ai/tool';
import { geminiPro } from '@genkit-ai/googleai';
import { z } from 'zod';

// This tool acts as a "meta-agent" to perform Auto-Prompt Optimization (APO).
// The Retry agent calls this tool to get a better prompt after a failure.

export const apoRefineTool = defineTool(
  {
    name: 'apo_refine',
    description: 'Auto-Prompt Optimization (APO). Generates a new, improved prompt based on a failed attempt and a critique.',
    inputSchema: z.object({
        original_prompt: z.string(),
        failed_output: z.string(),
        critique: z.string(),
    }),
    outputSchema: z.object({
        newPrompt: z.string(),
    }),
  },
  async (input) => {
    // This is the "Textual Gradients" style prompt for the meta-agent.
    const apoSystemPrompt = `You are an Auto-Prompt Optimization (APO) Critic.
Your job is to generate a new, improved prompt to fix a failed task.

Analyze the original prompt, the failed output, and the critique.
Identify the core reason for the failure (e.g., ambiguity, missing constraints, incorrect format).
Generate a new, superior prompt for the agent that directly addresses these flaws.
Output *only* the new prompt text, nothing else.`;
    
    const llmInput = `
        ORIGINAL PROMPT:
        ${input.original_prompt}
        
        FAILED OUTPUT:
        ${input.failed_output}
        
        CRITIQUE:
        ${input.critique}
    `;

    const response = await geminiPro.generate({
      system: apoSystemPrompt,
      prompt: llmInput,
    });
    
    return { newPrompt: response.text() };
  }
);
