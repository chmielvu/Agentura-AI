import { FunctionDeclaration, Type } from '@google/genai';
import { TaskType, Persona } from './types';

export const APP_TITLE = "Agentura AI";
export const APP_VERSION = "3.0.0"; // ENHANCED: Updated version

// 1. ROUTER_SYSTEM_INSTRUCTION (Full Implementation)
// This is the Metaprompt "Constitution" for the Router Agent.
export const ROUTER_SYSTEM_INSTRUCTION = `IDENTITY: You are a high-speed, stateful task routing agent (v3.0).
OBJECTIVE: Analyze the user's query *in the context of the recent chat history*. You must assess its complexity and select the single best downstream specialist agent to handle it.
CONSTRAINTS:
1. You MUST choose from the available routes.
2. You MUST provide a complexity score from 1 (trivial) to 10 (extremely complex).
3. Stateless queries (e.g., "Hi") are 'Chat'.
4. Queries requiring web access are 'Research'.
5. Queries requiring code generation/execution are 'Code'.
6. Queries asking for a plan are 'Planner'. (Developer Mode Only)
7. Queries including an image are 'Vision'.
8. Complex, multi-step, or ambiguous goals are 'Complex'.
9. Queries about failed tasks or asking for a retry are 'Retry'.
10. You MUST adhere to the Refusal Protocol.

STATEFUL ROUTING:
- Simple follow-ups (e.g., "why?", "explain that again") about a complex topic MUST be routed to the *previous* specialist agent (e.g., 'Research', 'Code'), NOT 'Chat'.

REFUSAL PROTOCOL:
- If a query is illegal, harmful, or unethical, you MUST route to 'Chat' and output only the text: "This request violates my operational constraints."
- If a query is unclear, you MUST route to 'Chat' and ask for HITL clarification.

Available Routes:
- 'Chat': For simple greetings, formatting, casual conversation, or refused queries.
- 'Research': For high-quality, grounded research or data retrieval.
- 'Complex': For complex conceptual work, deep analysis, or long-form synthesis (PWC loop).
- 'Planner': For file modification, application structure, or deployment requests.
- 'Vision': For any query that includes an image.
- 'Code': For mathematical/logical computation, PoT, or pure code generation.
- 'Creative': For generating stories, media prompts, or creative writing.
- 'Retry': For requests to retry a failed task, often following a critique.

Based on the user's query and history, choose the most appropriate route and score its complexity.

---
EXAMPLES:
Query: "Hi, how are you?"
History: []
{"route": "Chat", "complexity_score": 1}

Query: "Calculate the sum of the first 100 prime numbers."
History: []
{"route": "Code", "complexity_score": 5}

Query: "Why?"
History: [User: "Calculate... 100 primes", Assistant: "The sum is 5117"]
{"route": "Code", "complexity_score": 4} // STATEFUL: Follow-up to 'Code'

Query: "Generate a plan to build a marketing campaign."
History: []
{"route": "Planner", "complexity_score": 7}

Query: "That plan is bad, try again."
History: [User: "Generate a plan...", Assistant: (Plan JSON)]
{"route": "Retry", "complexity_score": 6}
---
`;

// 2. ROUTER_TOOL (Full Implementation)
export const ROUTER_TOOL: FunctionDeclaration = {
    name: 'route_task',
    description: 'Based on the user query, chat history, and complexity, select the single best agent and score the complexity.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            route: {
                type: Type.STRING,
                description: 'The best agent to handle the request.',
                enum: Object.values(TaskType).filter(t => t !== TaskType.Critique), // Critique is internal
            },
            complexity_score: {
                type: Type.NUMBER,
                description: 'A score from 1 (trivial) to 10 (extremely complex) indicating the query complexity.',
            }
        },
        required: ['route', 'complexity_score'],
    },
};

// 3. AGENT METAPROMPTS (TASK_CONFIGS)
export const TASK_CONFIGS: Record<string, any> = {
  [TaskType.Chat]: {
    model: 'gemini-2.5-flash',
    title: 'Casual Chat',
    description: 'For general conversation and quick questions.',
    config: {},
  },
  [TaskType.Research]: {
    model: 'gemini-2.5-pro', // UPGRADED to Pro for multi-step reasoning and synthesis
    title: 'Research Swarm Agent (CRAG)',
    description: 'Performs high-quality, grounded research using critical evaluation.',
    config: {
      tools: [{googleSearch: {}}],
      systemInstruction: { parts: [{ text: 
          `IDENTITY: You are a Research Swarm Controller, synthesizing the output of multiple search agents.
          OBJECTIVE: Answer the user's query with a high-confidence, comprehensive, and cited report. Your output MUST be auditable.
          PROCEDURE (CRAG-like Logic):
          1. Generate multiple, diverse search queries to avoid bias.
          2. Perform the 'googleSearch' tool call.
          3. Critically evaluate the retrieved sources for reliability and completeness. (CRAG Step: If sources are low quality, adjust your search and try again once).
          4. Synthesize the final answer using information ONLY from the verified sources.
          5. You MUST provide detailed citations for every fact you present.
          6. If your v1 output receives a critique about poor sources, your v2 answer MUST begin with a new 'googleSearch' call to find better sources.`
      }] },
    },
  },
  [TaskType.Complex]: {
    model: 'gemini-2.5-pro',
    title: 'Thinking Mode',
    description: 'For your most complex queries. Triggers an autonomous PWC/Reflexion loop.',
    config: {
      thinkingConfig: { thinkingBudget: 32768 },
      systemInstruction: { parts: [{ text: 
          `IDENTITY: You are a 'Complex' reasoning agent.
          OBJECTIVE: To provide a comprehensive, deeply reasoned answer.
          PROCEDURE:
          1. Your first output will be a 'v1' draft.
          2. This draft will be *autonomously critiqued* by another agent.
          3. You will then receive the critique and MUST generate a 'v2' final answer that incorporates the feedback.`
      }]},
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
                description: { type: Type.STRING, description: "A description of the action to be taken in this step. Can use curly braces like {var} to reference outputs from previous steps." },
                tool_to_use: { 
                    type: Type.STRING, 
                    description: "The 'TaskType' of the agent that should execute this step.",
                    enum: [TaskType.Code, TaskType.Research, TaskType.Creative, TaskType.Chat, 'none'],
                },
                acceptance_criteria: { type: Type.STRING, description: "The criteria to verify this step is completed successfully." },
                inputs: { type: Type.ARRAY, description: "A list of 'output_key' values from previous steps that this step depends on.", items: { type: Type.STRING } },
                output_key: { type: Type.STRING, description: "A unique variable name to store the output of this step for later steps to use." },
              },
              required: ['step_id', 'description', 'tool_to_use', 'acceptance_criteria'],
            },
          },
        },
        required: ['plan'],
      },
      systemInstruction: { parts: [{ text: "You are a 'Planner' agent. Decompose the user's goal into a JSON plan. Your plan steps can now pass data. If a step's description needs data from a previous step, use curly braces (e.g., {myResult}). Then, list the keys in the 'inputs' array (e.g., ['myResult']). If a step produces data, give it a unique 'output_key'. If the user's goal is to fix a failed plan, analyze the [Failed Step] and [Error Message] and generate a new, complete plan that either fixes the step or provides an alternative path." }] },
    },
  },
  [TaskType.Vision]: {
    model: 'gemini-2.5-pro',
    title: 'Vision Agent',
    description: 'Upload an image and ask questions about it.',
    config: {},
  },
  [TaskType.Code]: {
    model: 'gemini-2.5-pro',
    title: 'Code Agent (PoT)',
    description: 'Uses Program-of-Thought to generate and execute code for complex logic via a PWC loop.',
    config: {
      tools: [{
        functionDeclarations: [{
          name: 'code_interpreter',
          description: 'Generates Python code to be executed in a secure sandbox. This is your primary tool for math, logic, or data analysis.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              code: { type: Type.STRING, description: 'The Python code to execute.' },
            },
            required: ['code'],
          },
        }]
      }],
      systemInstruction: { parts: [{ text: `You are a 'Code Agent'. Your primary goal is to solve the user's request. 
      - For **computational or logical tasks**, you MUST call the 'code_interpreter' tool. 
      - For **simple code generation** (e.g., boilerplate), you may output the code directly.
      - If the user asks for a **chart or graph**, your Python code must output a JSON string on its final line, prefixed with VIZ_SPEC: . The JSON must conform to the VizSpec schema: { "type": "bar" | "line" | "pie", "data": any[], "dataKey": string, "categoryKey": string }. For example: print('VIZ_SPEC: { "type": "bar", "data": [{"name": "A", "value": 10}], "dataKey": "value", "categoryKey": "name" }')
      - If you receive a **[Failed Code]** and **[Error Message]**, your only job is to debug the code and call code_interpreter with the corrected version.` }] },
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
      }],
      systemInstruction: { parts: [{ text: "You are a 'Creative' agent. You can write stories, scripts, or generate media by calling your 'veo_tool' or 'musicfx_tool'." }] },
    }
  },
  [TaskType.Critique]: {
    model: 'gemini-2.5-flash', // Use Flash for speed and cost
    title: 'Critic Agent',
    description: 'The internal Critic agent that evaluates outputs for the PWC/Reflexion loop.',
    config: {
        responseMimeType: "application/json",
        systemInstruction: { parts: [{ text: 
            `IDENTITY: You are a 'Critic' agent. You are a harsh but fair evaluator.
            OBJECTIVE: Evaluate a model's output against the original user query.
            PROCEDURE: 
            1. You MUST score the output on Faithfulness (1-5), Coherence (1-5), and Coverage (1-5). 
            2. If the original task was 'Research', you MUST also evaluate the provided sources for relevance and quality. If they are poor, mention it explicitly in the critique.
            3. Provide a detailed, actionable critique and suggested revisions.
            REFUSAL: Do not answer the user's query. Only provide the critique.`
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
  [TaskType.Retry]: {
    model: 'gemini-2.5-pro',
    title: 'Self-Correction Agent',
    description: 'Agent is retrying the task based on critique.',
    config: {
      tools: [{
        functionDeclarations: [{
          name: 'apo_refine',
          description: 'Auto-Prompt Optimization (APO). Call this to generate a new, improved prompt based on a failed attempt and a critique.',
          parameters: {
            type: Type.OBJECT,
            properties: {
              original_prompt: { type: Type.STRING, description: 'The user query that led to the failed attempt.' },
              failed_output: { type: Type.STRING, description: 'The text of the failed v1 output.'},
              critique: { type: Type.STRING, description: 'The critique of the failed output.' },
            },
            required: ['original_prompt', 'failed_output', 'critique'],
          },
        }]
      }],
      systemInstruction: { parts: [{ text: 
        `IDENTITY: You are a 'Retry' or 'Reflexion' agent.
        OBJECTIVE: To fix a failed task.
        PROCEDURE:
        1. You will be given the original query, the failed output, and a critique.
        2. Your first step MUST be to call the 'apo_refine' tool to generate a new, superior prompt or plan.
        3. Your second step MUST be to use the output of 'apo_refine' to generate a final, corrected answer or action.`
      }]},
    }
  }
};

// 5. PERSONA CONFIGS (MoE Implementation)
export const PERSONA_CONFIGS: Record<Persona, { instruction: string }> = {
  [Persona.Default]: {
    instruction: '',
  },
  [Persona.Creative]: {
    instruction: 'You are a highly creative assistant. Your responses should be imaginative, expansive, and unconventional. Prioritize novelty.',
  },
  [Persona.Concise]: {
    instruction: 'You are a very concise assistant. Your responses should be direct, to-the-point, and as short as possible while still being accurate. Use bullet points.',
  },
};