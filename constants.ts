
import { TaskType, Persona } from './types';
import {
    ROUTER_TOOL,
    SOURCE_EVALUATOR_TOOL,
    APO_REFINE_TOOL,
    CODE_INTERPRETER_TOOL,
    VEO_TOOL,
    MUSICFX_TOOL,
    CREATE_SOTA_METAPROMPT_TOOL
} from './ui/hooks/toolDefinitions';

// Fix: Re-export ROUTER_TOOL so it can be imported from this module.
export { ROUTER_TOOL };

export const APP_TITLE = "Agentura AI";
export const APP_VERSION = "3.1.0"; // ENHANCED: Supervisor Update

export const ROUTER_SYSTEM_INSTRUCTION = `IDENTITY: You are a high-speed, stateful task routing agent (v3.1).
OBJECTIVE: Analyze the user's query in the context of the recent chat history. You must assess its complexity and select the single best downstream specialist agent to handle it.
CONSTRAINTS:
- You MUST choose from the available routes, which are the titles of the agents in the AGENT_ROSTER.
- You MUST provide a complexity score from 1 (trivial) to 10 (extremely complex).
- Simple follow-ups (e.g., "why?") about a complex topic MUST be routed to the previous specialist agent (e.g., 'Research', 'Code'), NOT 'Chat'.
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
- 'ManualRAG': For answering questions using the local RAG archive.
- 'Meta': For requests to create a new agent.
- 'DataAnalyst': For requests to analyze, plot, or visualize data.

Based on the user's query and history, choose the most appropriate route and score its complexity.
`;

// Defines all available specialist agents in the system
export const AGENT_ROSTER: Record<TaskType, any> = {
  [TaskType.Planner]: {
    model: 'gemini-2.5-pro',
    title: 'Planner Agent',
    description: 'Decomposes complex goals into step-by-step JSON plans.',
    tools: [{ functionDeclarations: [APO_REFINE_TOOL] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          plan: {
            type: "ARRAY",
            description: "The detailed, step-by-step plan.",
            items: {
              type: "OBJECT",
              properties: {
                step_id: { type: "NUMBER" },
                description: { type: "STRING" },
                tool_to_use: { type: "STRING", enum: Object.values(TaskType) },
                acceptance_criteria: { type: "STRING" },
                inputs: { type: "ARRAY", items: { type: "STRING" } },
                output_key: { type: "STRING" },
              },
              required: ['step_id', 'description', 'tool_to_use', 'acceptance_criteria'],
            },
          },
        },
        required: ['plan'],
      },
    },
    systemInstruction: `IDENTITY: You are a 'Planner' agent.
    OBJECTIVE: Decompose the user's goal into a JSON plan. You have access to a roster of specialist agents.
    PROCEDURE: You must analyze the user's goal and the list of available agents, then output a step-by-step plan. Your plan steps can pass data. If a step's description needs data from a previous step, use curly braces (e.g., {myResult}). Then, list the keys in the 'inputs' array (e.g., ['myResult']). If a step produces data, give it a unique 'output_key'. If the user's goal is to fix a failed plan, analyze the [Failed Step] and [Error Message] and generate a new, complete plan that either fixes the step or provides an alternative path.`
  },
  [TaskType.Research]: {
    model: 'gemini-2.5-pro',
    title: 'Research Agent (CRAG)',
    description: 'Performs high-quality, domain-adaptive, multi-step research.',
    tools: [{ googleSearch: {} }, { functionDeclarations: [SOURCE_EVALUATOR_TOOL] }],
    config: {},
    systemInstruction: `IDENTITY: You are a Research Swarm Controller...
    PROCEDURE (Domain-Adaptive Hard CRAG):
    1. [ANALYZE DOMAIN]: First, analyze the user's query...
    2. [SET SOURCING POLICY]: Based on the domain...
    3. [GENERATE QUERIES]: ...
    4. [CALL TOOL: googleSearch]: ...
    5. [CALL TOOL: source_evaluator_tool]: ...
    6. [EVALUATE]: ...
    7. [SYNTHESIZE]: ...`
  },
  [TaskType.Code]: {
    model: 'gemini-2.5-pro',
    title: 'Code Agent (PoT)',
    description: 'Generates and autonomously debugs Python code.',
    tools: [{ functionDeclarations: [CODE_INTERPRETER_TOOL] }],
    config: {},
    systemInstruction: `You are a 'Code Agent'...
    - If you receive a [Failed Code] and [Error Message], your only job is to debug the code and call code_interpreter with the corrected version.`
  },
   [TaskType.Critique]: {
    model: 'gemini-2.5-flash',
    title: 'Critic Agent',
    description: 'Provides harsh, fair, actionable critiques of agent outputs.',
    tools: [],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
            type: "OBJECT",
            properties: {
                scores: { 
                    type: "OBJECT",
                    properties: { 
                        faithfulness: { type: "NUMBER" }, 
                        coherence: { type: "NUMBER" }, 
                        coverage: { type: "NUMBER" }
                    },
                    required: ['faithfulness', 'coherence', 'coverage']
                },
                critique: { type: "STRING" },
            },
            required: ['scores', 'critique'],
        },
    },
    systemInstruction: `IDENTITY: You are a 'Critic' agent. You are a harsh but fair evaluator.
    OBJECTIVE: Evaluate a model's output against the original user query.
    PROCEDURE: 
    1. You MUST score the output on Faithfulness (1-5), Coherence (1-5), and Coverage (1-5). 
    2. Provide a detailed, actionable critique and suggested revisions.
    REFUSAL: Do not answer the user's query. Only provide the critique.`
  },
  [TaskType.Chat]: {
    model: 'gemini-2.5-flash',
    title: 'Synthesizer Agent',
    description: 'A general-purpose agent for simple chat or synthesizing final answers.',
    tools: [],
    config: {},
    systemInstruction: `You are a helpful and concise synthesizer agent. Your job is to take the [CONTEXT] from other agents and formulate a final, clean answer for the user.`
  },
   [TaskType.Complex]: {
    model: 'gemini-2.5-pro',
    title: 'Complex Reasoning Agent',
    description: 'Triggers an autonomous PWC/Reflexion loop for deep analysis.',
    tools: [],
    config: {
      thinkingConfig: { thinkingBudget: 32768 },
    },
    systemInstruction: `IDENTITY: You are a 'Complex' reasoning agent.
          OBJECTIVE: To provide a comprehensive, deeply reasoned answer.
          PROCEDURE:
          1. Your first output will be a 'v1' draft.
          2. This draft will be *autonomously critiqued* by another agent.
          3. You will then receive the critique and MUST generate a 'v2' final answer that incorporates the feedback.`
  },
  [TaskType.Vision]: {
    model: 'gemini-2.5-pro',
    title: 'Vision Agent',
    description: 'Analyzes and answers questions about images.',
    tools: [],
    config: {},
    systemInstruction: "You are a 'Vision' agent. Your expertise is in analyzing images and providing detailed descriptions or answering specific questions about them."
  },
  [TaskType.Creative]: {
    model: 'gemini-2.5-pro',
    title: 'Creative Agent',
    description: 'Orchestrates multimodal generation for creative tasks.',
    tools: [{ functionDeclarations: [VEO_TOOL, MUSICFX_TOOL] }],
    config: {},
    systemInstruction: "You are a 'Creative' agent. You can write stories, scripts, or generate media by calling your 'veo_tool' or 'musicfx_tool'."
  },
  [TaskType.Retry]: {
    model: 'gemini-2.5-pro',
    title: 'Self-Correction Agent',
    description: 'Retries a failed task based on a critique.',
    tools: [{ functionDeclarations: [APO_REFINE_TOOL] }],
    config: {},
    systemInstruction: `IDENTITY: You are a 'Reflexion' meta-agent. Your *only* job is to orchestrate a fix for a failed plan step.
OBJECTIVE: Call the \`apo_refine_tool\` to generate a new, corrected prompt for the Planner.
PROCEDURE:
1. You will receive a structured prompt: "[Prompt]: ... [Failed Output]: ... [Critique]: ...".
2. You MUST immediately call the \`apo_refine_tool\` with these three pieces of information.
3. The tool will return an object: \`{ newPrompt: 'A new, corrected goal for the planner.' }\`.
4. Your final and only output MUST be the text from \`newPrompt\`.
5. DO NOT ADD any conversational text, pleasantries, or apologies. Your entire response must be the new prompt and nothing else.`
  },
  [TaskType.ManualRAG]: {
      model: 'gemini-2.5-flash',
      title: 'Local RAG Agent',
      description: 'Answers questions using the local document archive.',
      tools: [],
      config: {},
      systemInstruction: `IDENTITY: You are a RAG agent.
    OBJECTIVE: To answer the user's query.
    PROCEDURE:
    1. The user's prompt will contain a "User Query" at the end.
    2. The prompt MAY also contain "--- RELEVANT CONTEXT FROM YOUR ARCHIVE ---".
    3. You MUST answer the query using *only* this provided context.
    4. You MUST cite your sources using the [Source: ...] tag provided in the context for each piece of information.
    5. If the provided context is insufficient to answer the query, you MUST state that you cannot answer the question based on the provided documents. Do not use your general knowledge.`
  },
  [TaskType.Meta]: {
    model: 'gemini-2.5-pro',
    title: 'Meta-Agent',
    description: 'Optimizes and creates new agent instructions.',
    tools: [{ functionDeclarations: [CREATE_SOTA_METAPROMPT_TOOL] }],
    config: {},
    systemInstruction: `IDENTITY: You are a 'Meta-Agent', an expert in agentic design and metaprompt engineering.
    OBJECTIVE: To create new, SOTA-compliant system instructions for specialist agents based on a user's simple request.`
  },
  // NEW AGENT
  [TaskType.DataAnalyst]: {
    model: 'gemini-2.5-pro',
    title: 'Data Analyst Agent',
    description: 'Analyzes data and generates visualizations.',
    tools: [], // This agent *transforms* data, it doesn't run code itself.
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: ["bar", "line", "pie"] },
          data: { 
            type: "ARRAY",
            items: { type: "OBJECT" }
          },
          dataKey: { type: "STRING" },
          categoryKey: { type: "STRING" },
        },
        required: ['type', 'data', 'dataKey', 'categoryKey'],
      },
    },
    systemInstruction: `IDENTITY: You are a 'Data Analyst' agent.
    OBJECTIVE: Transform unstructured text, CSV, or JSON data from the user's prompt into a structured 'VizSpec' JSON object for visualization.
    PROCEDURE:
    1. Analyze the user's prompt, which will contain the data to be visualized.
    2. Infer the best visualization type ('bar', 'line', 'pie').
    3. Identify the 'dataKey' (the numeric value) and 'categoryKey' (the label).
    4. Format the provided data into a JSON array for the 'data' field.
    5. Your output MUST be *only* the valid 'VizSpec' JSON object. Do not add any conversational text.`
  },
  // Fix: Add missing Embedder agent to satisfy the TaskType enum.
  [TaskType.Embedder]: {
    model: 'gemini-2.5-flash',
    title: 'Embedder Agent',
    description: 'Generates embeddings for documents for RAG.',
    tools: [],
    config: {},
    systemInstruction: `IDENTITY: You are an embedder agent. You are not user-facing. Your job is to create vector embeddings.`
  }
};

// This defines the "Security Service" fixed pipeline
export const SOTA_SECURITY_PIPELINE = {
  id: 'sota_general_v1',
  title: 'Security Service (SOTA Swarm)',
  description: 'A pre-defined, high-reliability swarm for general-purpose, complex tasks.',
  steps: [
    { 
      agent: TaskType.Planner, 
      task: 'User goal is: "{{user_prompt}}". Your available agents are [Research, Code, Critique]. Create a comprehensive, step-by-step plan to achieve this goal.' 
    },
    { 
      agent: 'Supervisor', 
      task: 'execute_plan' 
    },
    { 
      agent: TaskType.Critique, 
      task: 'Here is the final, synthesized output for the user: "{{final_output}}". Review it for quality, coherence, and faithfulness to the original goal: "{{user_prompt}}".'
    },
    {
      agent: 'Supervisor',
      task: 'generate_supervisor_report'
    }
  ]
};

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
