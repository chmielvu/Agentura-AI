
import { FunctionDeclaration, Type } from '@google/genai';
import { TaskType } from '../../types';

export const ROUTER_TOOL: FunctionDeclaration = {
    name: 'route_task',
    description: 'Based on the user query, chat history, and complexity, select the single best agent and score the complexity.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            route: {
                type: Type.STRING,
                description: 'The best agent to handle the request.',
                enum: Object.values(TaskType).filter(t => t !== TaskType.Critique && t !== TaskType.Verifier && t !== TaskType.Reranker && t !== TaskType.Embedder && t !== TaskType.Supervisor && t !== TaskType.Router), // Internal agents + Router itself
            },
            complexity_score: {
                type: Type.NUMBER,
                description: 'A score from 1 (trivial) to 10 (extremely complex) indicating the query complexity.'
            }
        },
        required: ['route', 'complexity_score'],
    },
};

// MANDATE 2.2
export const AUTONOMOUS_RAG_TOOL: FunctionDeclaration = {
    name: 'autonomous_rag_tool',
    description: 'Checks the local, persistent document archive (IndexedDB) for information relevant to a query. Use this FIRST before searching the web.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: { type: Type.STRING, description: 'The semantic query to search the local vector archive with.' },
        },
        required: ['query'],
    },
};

export const SOURCE_EVALUATOR_TOOL: FunctionDeclaration = {
    name: 'source_evaluator_tool',
    description: 'Evaluates a list of search results against a user query for quality, relevance, and sufficiency.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: { type: Type.STRING, description: 'The original user query.' },
            domain: { type: Type.STRING, description: "The query's domain ('Technical' or 'Non-Technical')." },
            sourcing_policy: { type: Type.STRING, description: 'The sourcing policy to evaluate against.' },
            sources: {
                type: Type.ARRAY,
                description: 'The array of search results from googleSearch.',
                items: {
                    type: Type.OBJECT,
                    properties: {
                        url: { type: Type.STRING },
                        snippet: { type: Type.STRING },
                        sourceTitle: { type: Type.STRING }
                    }
                }
            }
        },
        required: ['query', 'domain', 'sourcing_policy', 'sources'],
    },
};

export const APO_REFINE_TOOL: FunctionDeclaration = {
    name: 'apo_refine',
    description: 'Auto-Prompt Optimization (APO). Call this to generate a new, improved prompt or plan step description based on a failed attempt and an error message or critique.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            original_prompt: { type: Type.STRING, description: 'The user query or goal that led to the failed attempt.' },
            failed_output: { type: Type.STRING, description: 'The text of the failed v1 output, or the description of the failed plan step.' },
            critique: { type: Type.STRING, description: 'The critique or error message of the failed output.' }
        },
        required: ['original_prompt', 'failed_output', 'critique'],
    },
};

export const CODE_INTERPRETER_TOOL: FunctionDeclaration = {
    name: 'code_interpreter',
    description: 'Generates Python code to be executed in a secure sandbox. This is your primary tool for math, logic, or data analysis.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            code: { type: Type.STRING, description: 'The Python code to execute.' }
        },
        required: ['code'],
    },
};

export const VEO_TOOL: FunctionDeclaration = {
    name: 'veo_tool',
    description: 'Generates a high-quality video clip based on a detailed, cinematic prompt.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: { type: Type.STRING, description: 'A highly descriptive, cinematic prompt including camera motion, lens, lighting, and audio.' }
        },
        required: ['prompt'],
    },
};

export const MUSICFX_TOOL: FunctionDeclaration = {
    name: 'musicfx_tool',
    description: 'Generates royalty-free background music based on a prompt with mood, genre, and instrument tags.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            prompt: { type: Type.STRING, description: 'A prompt describing the vibe of the music.' },
            tags: {
                type: Type.OBJECT,
                properties: {
                    genre: { type: Type.ARRAY, items: { type: Type.STRING } },
                    instruments: { type: Type.ARRAY, items: { type: Type.STRING } },
                    tempo: { type: Type.STRING }
                }
            }
        },
        required: ['prompt'],
    },
};

export const CREATE_SOTA_METAPROMPT_TOOL: FunctionDeclaration = {
    name: 'create_sota_metaprompt',
    description: 'Generates a new, SOTA-compliant agent system instruction based on a simple user request. The metaprompt must include IDENTITY, OBJECTIVE, and a multi-step PROCEDURE.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            agent_role: { type: Type.STRING, description: 'The simple role for the new agent (e.g., "a travel agent").' },
            agent_goal: { type: Type.STRING, description: 'The high-level goal for the new agent (e.g., "find the best flights").' }
        },
        required: ['agent_role', 'agent_goal'],
    },
};

// A list of all possible nodes the Supervisor can route to.
// We must filter out the Supervisor itself.
const allGraphNodes = [
  ...Object.values(TaskType).filter(t => t !== TaskType.Supervisor),
  'A_FINAL'
];

export const SUPERVISOR_ROUTER_TOOL: FunctionDeclaration = {
  name: 'route_next_step',
  description: 'The Supervisor\'s decision. Route to the single next agent node in the graph.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      agent_to_call: {
        type: Type.STRING,
        description: 'The next agent to execute, or "A_FINAL" to finish.',
        enum: allGraphNodes,
      },
      reasoning: {
        type: Type.STRING,
        description: 'A brief, 1-sentence justification for this routing decision.'
      }
    },
    required: ['agent_to_call', 'reasoning'],
  },
};
