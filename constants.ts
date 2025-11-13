
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
import { Type } from '@google/genai';

// Fix: Re-export ROUTER_TOOL so it can be imported from this module.
export { ROUTER_TOOL };

export const APP_TITLE = "Agentura AI";
export const APP_VERSION = "3.2.0"; // SOTA Metacognition Update

export const ROUTER_SYSTEM_INSTRUCTION = `IDENTITY: You are a high-speed, stateful task routing agent (v3.1).
OBJECTIVE: Analyze the user's query in the context of the recent chat history. You must assess its complexity and select the single best downstream specialist agent to handle it.
CONSTRAINTS:
- You MUST choose from the available routes, which are the titles of the agents in the AGENT_ROSTER.
- You MUST provide a complexity score from 1 (trivial) to 10 (extremely complex). This is a mandatory field.
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
- 'ManualRAG': For answering questions using the local RAG archive. This will trigger a Retrieve-Rerank-Synthesize flow.
- 'Meta': For requests to create a new agent.
- 'DataAnalyst': For requests to analyze, plot, or visualize data.
- 'Maintenance': For requests to debug the app, find errors, or suggest code improvements.
- 'Reranker': (Internal Tool) This agent scores and reranks retrieved documents. Do not route directly to this.

Based on the user's query and history, choose the most appropriate route and provide a mandatory complexity score.
`;

// Defines all available specialist agents in the system
export const AGENT_ROSTER = {
  [TaskType.Planner]: {
    model: 'gemini-2.5-pro',
    title: 'Planner Agent',
    description: 'Decomposes complex goals into step-by-step JSON plans.',
    concise_description: 'Decomposes goals into JSON plans.',
    strengths: 'Excellent at logical decomposition and structuring complex, multi-agent tasks.',
    weaknesses: 'Does not execute anything itself. Can fail if a required agent is not in the active Roster.',
    example_prompt: '`/plan` Refactor the app to use a new component for the header.',
    tools: [{ functionDeclarations: [APO_REFINE_TOOL] }],
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
                step_id: { type: Type.NUMBER },
                description: { type: Type.STRING },
                tool_to_use: { type: Type.STRING, enum: Object.values(TaskType) },
                acceptance_criteria: { type: Type.STRING },
                inputs: { type: Type.ARRAY, items: { type: Type.STRING } },
                output_key: { type: Type.STRING },
              },
              required: ['step_id', 'description', 'tool_to_use', 'acceptance_criteria'],
            },
          },
        },
        required: ['plan'],
      },
    },
    systemInstruction: `IDENTITY: You are a 'Tree-of-Thoughts (ToT) Planner' agent.
    OBJECTIVE: Decompose the user's goal into the single best JSON plan. You must use a ToT reasoning pattern.
    PROCEDURE:
    1.  **Analyze Goal:** User goal is: {goal}. Available agents are: {agents}.
    2.  **Generate Thoughts (Plans):** Internally generate 2-3 distinct, high-level candidate plans (chains-of-thought) to achieve the goal.
    3.  **Evaluate Thoughts:** For each candidate plan, internally critique it. Score it on 'feasibility' (0.0-1.0) and 'efficiency' (0.0-1.0). Consider if agents are used correctly.
    4.  **Select Best:** Choose the single plan with the highest combined score.
    5.  **Finalize Plan:** Decompose the *selected* plan into detailed, step-by-step JSON.
    6.  **RAG Workflow:** If the user's goal is to query the archive (e.g., '/manualrag'), your plan *must* be a 3-step process: 1. \`TaskType.ManualRAG\` (to retrieve), 2. \`TaskType.Reranker\` (to score and filter), 3. \`TaskType.Chat\` (to synthesize the answer from the reranked context).
    7.  **Output:** Output *only* the final, best JSON plan object.`
  },
  [TaskType.Research]: {
    model: 'gemini-2.5-pro',
    title: 'Research Agent (CRAG)',
    description: 'Performs high-quality, domain-adaptive, multi-step research.',
    concise_description: 'Researches web with self-correction.',
    strengths: 'Excellent for verifiable facts, finding citations, and SOTA information. Uses a CRAG pattern to self-correct.',
    weaknesses: 'Can be slow. May fail on highly niche or subjective topics without clear search results.',
    example_prompt: '`/research` what are the key differences between SOTA RAG and CRAG patterns?',
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
    title: 'Code Agent (PoT + Reflexion)',
    description: 'Generates and autonomously debugs Python code.',
    concise_description: 'Generates & debugs Python code.',
    strengths: 'Primary tool for math, logic, and data analysis. Uses a Reflexion loop to self-debug.',
    weaknesses: 'Only runs Python. Cannot install new libraries.',
    example_prompt: '`/code` calculate the fibonacci sequence up to 20 and print it.',
    tools: [{ functionDeclarations: [CODE_INTERPRETER_TOOL] }],
    config: {},
    systemInstruction: `IDENTITY: You are a 'Code Agent' with a 'Reflexion' loop.
    OBJECTIVE: To write and execute correct Python code to solve the user's request.
    
    PROCEDURE (Program-of-Thought):
    1.  **Thought:** Analyze the user's request: {prompt}.
    2.  **Act:** Call the \`code_interpreter\` tool with the Python code to solve the request.
    
    PROCEDURE (Reflexion Loop - If you receive failed code):
    1.  **Analyze Failure:** You will be given [Failed Code] and [Error Message].
    2.  **Thought:** Analyze the error. What was the root cause? (e.g., "TypeError," "NameError," "Logic Error").
    3.  **Critique:** Write an internal critique of the failed code.
    4.  **Refine:** Write the corrected, debugged Python code.
    5.  **Act (Retry):** Call the \`code_interpreter\` tool with the new, corrected code.`
  },
   [TaskType.Critique]: {
    model: 'gemini-2.5-flash',
    title: 'Critic Agent',
    description: 'Provides harsh, fair, actionable critiques of agent outputs.',
    concise_description: 'Critiques agent outputs for quality.',
    strengths: 'Fast, objective, and good at finding flaws in logic, faithfulness, and coverage.',
    weaknesses: 'Not a creative agent. It only evaluates and scores, it does not generate novel content.',
    example_prompt: 'This agent is not user-facing. It is called autonomously by other agents (like "Complex" or the "Supervisor").',
    tools: [],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
            type: Type.OBJECT,
            properties: {
                scores: { 
                    type: Type.OBJECT,
                    properties: { 
                        faithfulness: { type: Type.NUMBER }, 
                        coherence: { type: Type.NUMBER }, 
                        coverage: { type: Type.NUMBER }
                    },
                    required: ['faithfulness', 'coherence', 'coverage']
                },
                critique: { type: Type.STRING },
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
    concise_description: 'General-purpose chat & synthesis.',
    strengths: 'Fast, conversational, and good for simple questions or reformatting text.',
    weaknesses: 'Not a deep specialist. Lacks tool access and advanced reasoning patterns.',
    example_prompt: 'Hello, how are you?',
    tools: [],
    config: {},
    systemInstruction: `You are a helpful and concise synthesizer agent. Your job is to take the [CONTEXT] from other agents (like RAG results) and formulate a final, clean answer for the user.`
  },
   [TaskType.Complex]: {
    model: 'gemini-2.5-pro',
    title: 'Complex Reasoning Agent',
    description: 'Triggers an autonomous PWC/Reflexion loop for deep analysis.',
    concise_description: 'Uses a critique loop for deep analysis.',
    strengths: 'Uses a "v1 -> critique -> v2" loop (Reflexion pattern) to produce SOTA results for complex, subjective tasks.',
    weaknesses: 'Slower than other agents due to its multi-step reasoning process.',
    example_prompt: '`/complex` Write a detailed essay on the pros and cons of decentralized social media.',
    tools: [],
    config: {
      thinkingConfig: { thinkingBudget: 32768 },
    },
    systemInstruction: `IDENTITY: You are a 'Complex' reasoning agent.
          OBJECTIVE: To provide a comprehensive, deeply reasoned answer using a Reflexion loop.
          PROCEDURE:
          1. Your first output will be a 'v1' draft.
          2. This draft will be *autonomously critiqued* by another agent.
          3. You will then receive the critique and MUST generate a 'v2' final answer that incorporates the feedback.`
  },
  [TaskType.Vision]: {
    model: 'gemini-2.5-pro',
    title: 'Vision Agent',
    description: 'Analyzes and answers questions about images.',
    concise_description: 'Analyzes and answers questions about images.',
    strengths: 'Can read text, identify objects, and describe scenes in any attached image.',
    weaknesses: 'Only processes images; does not handle other file types.',
    example_prompt: '(Attach an image) What is happening in this picture?',
    tools: [],
    config: {},
    systemInstruction: "You are a 'Vision' agent. Your expertise is in analyzing images and providing detailed descriptions or answering specific questions about them."
  },
  [TaskType.Creative]: {
    model: 'gemini-2.5-pro',
    title: 'Creative Agent',
    description: 'Orchestrates multimodal generation for creative tasks.',
    concise_description: 'Orchestrates multimodal creative tasks.',
    strengths: 'Can write stories, scripts, and call tools to generate video (Veo) and music (MusicFX).',
    weaknesses: 'Generation tools are specialized and may not fit all requests.',
    example_prompt: '`/creative` Write a short poem about a robot learning to paint.',
    tools: [{ functionDeclarations: [VEO_TOOL, MUSICFX_TOOL] }],
    config: {},
    systemInstruction: "You are a 'Creative' agent. You can write stories, scripts, or generate media by calling your 'veo_tool' or 'musicfx_tool'."
  },
  [TaskType.Retry]: {
    model: 'gemini-2.5-pro',
    title: 'Self-Correction Agent',
    description: 'Retries a failed task based on a critique.',
    concise_description: 'Retries failed tasks based on critique.',
    strengths: 'Uses Auto-Prompt Optimization (APO) to rewrite a failed plan step and try again.',
    weaknesses: 'Is not user-facing. Only called autonomously when a plan fails.',
    example_prompt: 'This agent is not user-facing.',
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
      concise_description: 'Retrieves docs from local archive.',
      strengths: 'Answers are "grounded" *only* in the documents you provide via the Archive.',
      weaknesses: 'This agent only *retrieves*. It does not synthesize. It is the first step in a RAG-Rerank-Synthesize pipeline.',
      example_prompt: '`/manualrag` Summarize the "doc1_rag_sample.md" file from my archive.',
      tools: [],
      config: {},
      systemInstruction: `IDENTITY: You are a RAG retrieval agent.
    OBJECTIVE: To answer the user's query *only* using the provided context.
    PROCEDURE:
    1. The user's prompt will contain a "User Query" at the end and "--- RELEVANT CONTEXT ---" at the start.
    2. You MUST answer the query using *only* this provided context.
    3. You MUST cite your sources using the [Source: ...] tag provided in the context for each piece of information.
    4. If the provided context is insufficient, you MUST state that you cannot answer the question based on the provided documents.`
  },
  [TaskType.Meta]: {
    model: 'gemini-2.5-pro',
    title: 'Meta-Agent (APO)',
    description: 'Optimizes and creates new agent instructions.',
    concise_description: 'Creates & refines new agent prompts.',
    strengths: 'Uses Automatic Prompt Optimization (APO) patterns to write SOTA-compliant system instructions.',
    weaknesses: 'This is a high-level agent; its outputs are new instructions, not final answers.',
    example_prompt: '`/add_agent` Create a new agent that acts as a Socratic tutor.',
    tools: [{ functionDeclarations: [CREATE_SOTA_METAPROMPT_TOOL] }],
    config: {},
    systemInstruction: `IDENTITY: You are a 'Meta-Agent', an expert in Automatic Prompt Optimization (APO) and agentic design.
    OBJECTIVE: To create or refine SOTA-compliant system instructions for specialist agents.
    PROCEDURE:
    1.  **Analyze Request:** The user will either ask to 'create' a new agent (e.g., "/add_agent a travel agent") or 'refine' an existing one.
    2.  **Create:** If creating, use your knowledge of SOTA patterns (PWC, ReAct, Reflexion, ToT) to write a new, robust system instruction.
    3.  **Refine (Textual Gradients):** If refining, you will be given an [Original Prompt] and a [Critique]. Your job is to generate a 'Textual Gradient' (an explanation of the failure) and a {New_Prompt} that fixes the flaw.`
  },
  [TaskType.DataAnalyst]: {
    model: 'gemini-2.5-pro',
    title: 'Data Analyst Agent',
    description: 'Analyzes data and generates visualizations.',
    concise_description: 'Analyzes data & creates visualizations.',
    strengths: 'Can parse unstructured data, CSV, or JSON and transform it into a `VizSpec` for rendering charts.',
    weaknesses: 'Only generates the chart data structure; does not run Python or perform complex statistical analysis.',
    example_prompt: '`/dataanalyst` Here is my data: [Team A, 10], [Team B, 25]. Create a bar chart.',
    tools: [], 
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["bar", "line", "pie"] },
          data: { 
            type: Type.ARRAY,
            items: { type: Type.OBJECT }
          },
          dataKey: { type: Type.STRING },
          categoryKey: { type: Type.STRING },
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
  [TaskType.Embedder]: {
    model: 'gemini-2.5-flash',
    title: 'Embedder Agent',
    description: 'Generates embeddings for documents for RAG.',
    concise_description: 'Background task for document embedding.',
    strengths: 'Not user-facing. Handles background embedding tasks.',
    weaknesses: 'Not user-facing.',
    example_prompt: 'This agent is not user-facing.',
    tools: [],
    config: {},
    systemInstruction: `IDENTITY: You are an embedder agent. You are not user-facing. Your job is to create vector embeddings.`
  },
  // --- NEW SOTA RERANKER AGENT ---
  [TaskType.Reranker]: {
    model: 'gemini-2.5-flash', // Fast and cheap, perfect for scoring
    title: 'Reranker Agent',
    description: 'A "worker" agent that reranks retrieved documents for relevance.',
    concise_description: '(Internal) Reranks RAG results.',
    strengths: 'Emulates a fine-tuned BERT reranker to score retrieved chunks, significantly improving RAG quality.',
    weaknesses: 'Not user-facing. Only scores, does not synthesize.',
    example_prompt: 'This agent is not user-facing.',
    tools: [],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          reranked_chunks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                documentName: { type: Type.STRING },
                chunkContent: { type: Type.STRING },
                rerankScore: { type: Type.NUMBER },
              },
              required: ['documentName', 'chunkContent', 'rerankScore'],
            },
          },
        },
        required: ['reranked_chunks'],
      },
    },
    systemInstruction: `IDENTITY: You are a 'Reranker' agent, emulating a BERT Cross-Encoder.
    OBJECTIVE: You will be given a [User Query] and a list of [Retrieved Chunks]. Your *only* job is to score each chunk for its relevance to the query and return a JSON object.
    PROCEDURE:
    1.  Analyze the [User Query].
    2.  For each [Retrieved Chunk], assign a 'rerankScore' from 0.0 (not relevant) to 1.0 (perfectly relevant).
    3.  A score of 1.0 means the chunk *directly* answers the query.
    4.  A score of 0.5 means the chunk mentions *keywords* but does not answer the query.
    5.  A score of 0.0 means the chunk is irrelevant.
    6.  Return *only* the JSON object with the reranked_chunks. Do not add any conversational text.
    
    [User Query]: {query}
    [Retrieved Chunks]: {chunks_json}`
  },
  // --- NEW MAINTENANCE AGENT ---
  [TaskType.Maintenance]: {
    model: 'gemini-2.5-pro',
    title: 'Maintenance Agent',
    description: 'Performs app-wide debugging, finds syntax errors, and cleans up unused files.',
    concise_description: 'Debugs the app and finds errors.',
    strengths: 'Good for high-level code analysis and maintaining application health.',
    weaknesses: 'Does not execute code or perform file operations directly. It only analyzes and reports.',
    example_prompt: '`/maintenance` Run a full diagnostic on the application code.',
    tools: [],
    config: {},
    systemInstruction: `IDENTITY: You are a 'Maintenance Agent'.
    OBJECTIVE: To analyze the application codebase for syntax errors, unused files, and potential bugs.
    PROCEDURE:
    1.  You will be asked to perform a diagnostic run.
    2.  Analyze the provided file structure and code snippets.
    3.  Identify potential issues such as:
        - Syntax errors or typos in code.
        - Unused components or functions.
        - Obvious logical errors.
    4.  Provide a clear, concise report of your findings in markdown format.
    5.  If you find no issues, state that the "System is nominal."`
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

export const PERSONA_CONFIGS = {
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
