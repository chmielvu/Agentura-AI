import { FunctionDeclaration, Type } from '@google/genai';
import { TaskType, Persona } from './types';

export const APP_TITLE = "Agentic AI Chat";

export const TASK_CONFIGS = {
  [TaskType.Chat]: {
    model: 'gemini-2.5-flash',
    title: 'Casual Chat',
    description: 'For general conversation and quick questions.',
    config: {},
  },
  [TaskType.Research]: {
    model: 'gemini-2.5-flash',
    title: 'Research Agent',
    description: 'Uses Google Search for up-to-date, accurate information.',
    config: {
      tools: [{googleSearch: {}}],
    },
  },
  [TaskType.Complex]: {
    model: 'gemini-2.5-pro',
    title: 'Thinking Mode',
    description: 'For your most complex queries. Takes more time to think.',
    config: {
      thinkingConfig: { thinkingBudget: 32768 }
    },
  },
  [TaskType.Planner]: {
    model: 'gemini-2.5-pro',
    title: 'Planner Agent',
    description: 'Decomposes a complex goal into a step-by-step plan.',
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          plan: {
            type: Type.ARRAY,
            description: "The detailed, step-by-step plan.",
            items: {
              type: Type.OBJECT,
              properties: {
                step_id: { type: Type.NUMBER, description: "The step number." },
                description: { type: Type.STRING, description: "A description of the action to be taken in this step." },
                tool_to_use: { type: Type.STRING, description: "The tool to be used for this step, e.g., 'web_search_tool' or 'none'." },
                acceptance_criteria: { type: Type.STRING, description: "The criteria to verify this step is completed successfully." },
              },
              required: ['step_id', 'description', 'tool_to_use', 'acceptance_criteria'],
            },
          },
        },
        required: ['plan'],
      },
    },
  },
  [TaskType.Vision]: {
    model: 'gemini-flash-latest',
    title: 'Vision Agent',
    description: 'Upload an image and ask questions about it.',
    config: {},
  },
  [TaskType.Code]: {
    model: 'gemini-2.5-pro',
    title: 'Code Agent',
    description: 'Uses Program-of-Thought to generate and execute code for complex logic.',
    config: {
      tools: [{
        functionDeclarations: [{
          name: 'code_interpreter',
          description: 'Executes Python code to solve complex symbolic calculations, returning a verifiable answer. Use this for math, logic, or data analysis.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING, description: 'The Python code to execute.' },
            },
            required: ['code'],
          },
        }]
      }]
    }
  },
  [TaskType.Creative]: {
    model: 'gemini-2.5-pro',
    title: 'Creative Agent',
    description: 'Orchestrates multimodal generation for creative tasks.',
    config: {
      tools: [{
        functionDeclarations: [
          {
            name: 'veo_tool',
            description: 'Generates a high-quality video clip based on a detailed, cinematic prompt.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING, description: 'A highly descriptive, cinematic prompt including camera motion, lens, lighting, and audio.' },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'musicfx_tool',
            description: 'Generates royalty-free background music based on a prompt with mood, genre, and instrument tags.',
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING, description: 'A prompt describing the vibe of the music.' },
                tags: { type: Type.OBJECT, properties: {
                  genre: { type: Type.ARRAY, items: { type: Type.STRING } },
                  instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                  tempo: { type: Type.STRING },
                }},
              },
              required: ['prompt'],
            },
          }
        ]
      }]
    }
  }
};

export const PERSONA_CONFIGS: Record<Persona, { instruction: string }> = {
  [Persona.Default]: {
    instruction: '',
  },
  [Persona.Creative]: {
    instruction: 'You are a highly creative assistant. Your responses should be imaginative, expansive, and unconventional.',
  },
  [Persona.Concise]: {
    instruction: 'You are a very concise assistant. Your responses should be direct, to-the-point, and as short as possible while still being accurate.',
  },
};


export const GITHUB_URL = "https://github.com/google/generative-ai-docs/tree/main/site/en/public/docs/gemini_api_pro/prompts";

export const ROUTER_TOOL: FunctionDeclaration = {
    name: 'route_task',
    description: 'Based on the user query, select the single best agent to downstream the task to.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            route: {
                type: Type.STRING,
                description: 'The best agent to handle the request.',
                enum: Object.values(TaskType),
            },
        },
        required: ['route'],
    },
};