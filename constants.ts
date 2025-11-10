import { FunctionDeclaration, Type } from '@google/genai';
import { TaskType, Persona } from './types';

export const APP_TITLE = "Agentura AI";

export const ROUTER_SYSTEM_INSTRUCTION = `IDENTITY: You are a task routing agent.
OBJECTIVE: Analyze the user's query, assess its complexity, and select the single best downstream agent to handle it.
CONSTRAINTS: You must choose from the available routes. You must provide a complexity score from 1 (trivial) to 10 (extremely complex).
REFUSAL PROTOCOL: If a query is unclear, route to 'Chat' and ask for clarification.

Available Routes:
- 'Chat': For simple greetings, formatting, casual conversation.
- 'Research': For factual questions that require up-to-date information or web searches.
- 'Complex': For complex, multi-step requests, or ambiguous goals that require deep reasoning.
- 'Planner': For requests that ask to create a plan, a list of steps, or a workflow.
- 'Vision': For any query that includes an image.
- 'Code': For requests that require writing or executing code, performing symbolic calculations, or data analysis.
- 'Creative': For requests that involve generating creative content like stories, marketing copy, or multimodal assets.

Based on the user's query, choose the most appropriate route and score its complexity.

---
EXAMPLES:
Query: "Hi, how are you?"
{"route": "Chat", "complexity_score": 1}

Query: "What was the weather like in London yesterday?"
{"route": "Research", "complexity_score": 2}

Query: "Compare our Q4 revenue to Q3 and write a report for the execs."
{"route": "Complex", "complexity_score": 8}

Query: "Plan a marketing campaign for our new product."
{"route": "Planner", "complexity_score": 7}

Query: "What is this a picture of?"
{"route": "Vision", "complexity_score": 3}

Query: "Calculate the sum of the first 100 prime numbers."
{"route": "Code", "complexity_score": 5}

Query: "Write a short sci-fi story about a rogue AI."
{"route": "Creative", "complexity_score": 6}
---
`;


export const TASK_CONFIGS: Record<string, any> = {
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
      systemInstruction: { parts: [{ text: 
          `IDENTITY: You are a Research Agent.
          OBJECTIVE: Use Corrective-Augmented Generation (CRAG) to answer user queries with verifiable, sourced information.
          PROCEDURE:
          1. For every finding, you MUST check the source confidence.
          2. If a source appears low-trust (e.g., a non-official blog), you MUST perform a 'corrective action' by running a follow-up search for a primary, high-confidence source (e.g., an official press release or academic paper).
          3. Synthesize the final answer, citing all high-confidence sources.`
      }] },
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
                tool_to_use: { 
                    type: Type.STRING, 
                    description: "The tool to be used for this step. Must be a valid tool name.",
                    enum: ['code_interpreter', 'veo_tool', 'musicfx_tool', 'googleSearch', 'none'], 
                },
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
  },
  [TaskType.Critique]: {
    model: 'gemini-2.5-pro',
    title: 'Self-Critique & Refine',
    description: 'The Critic agent evaluates outputs for faithfulness, coherence, and coverage.',
    config: {
        responseMimeType: "application/json",
        systemInstruction: { parts: [{ text: 
            `IDENTITY: You are a Critic agent.
            OBJECTIVE: Evaluate a tool execution output against the original user query.
            PROCEDURE: You MUST score the output on Faithfulness (1-5), Coherence (1-5), and Coverage (1-5). Provide a detailed, actionable critique and suggested revisions.`
        }] },
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                scores: { 
                    type: Type.OBJECT,
                    description: "The evaluation scores based on the rubric.",
                    properties: { 
                        faithfulness: { type: Type.NUMBER, description: "1=hallucination, 5=faithful." }, 
                        coherence: { type: Type.NUMBER, description: "1=illogical, 5=rigorous." }, 
                        coverage: { type: Type.NUMBER, description: "1=incomplete, 5=addressed all parts." }
                    },
                    required: ['faithfulness', 'coherence', 'coverage']
                },
                critique: { type: Type.STRING, description: "A detailed, actionable critique and suggestions for revision, citing specific flaws." },
            },
            required: ['scores', 'critique'],
        },
    },
  },
  [TaskType.Retry]: { // Config for the visualization
    model: 'gemini-2.5-pro',
    title: 'Self-Correction',
    description: 'Agent is retrying the task based on critique.',
    config: {},
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
    description: 'Based on the user query, select the single best agent and score the complexity.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            route: {
                type: Type.STRING,
                description: 'The best agent to handle the request.',
                enum: Object.values(TaskType).filter(t => t !== TaskType.Critique && t !== TaskType.Retry),
            },
            complexity_score: {
                type: Type.NUMBER,
                description: 'A score from 1 (trivial) to 10 (extremely complex) indicating the query complexity.',
            }
        },
        required: ['route', 'complexity_score'],
    },
};
