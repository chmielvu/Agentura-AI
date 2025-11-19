
export enum TaskType {
  Chat = 'Chat',
  Research = 'Research',
  Complex = 'Complex',
  Planner = 'Planner',
  Vision = 'Vision',
  Code = 'Code',
  Creative = 'Creative',
  Critique = 'Critique',
  Retry = 'Retry',
  Embedder = 'Embedder',
  ManualRAG = 'ManualRAG',
  Meta = 'Meta',
  DataAnalyst = 'DataAnalyst',
  Reranker = 'Reranker',
  Verifier = 'Verifier', // MANDATE 1.2
  Maintenance = 'Maintenance',
  Supervisor = 'Supervisor',
  // FIX: Add Router to TaskType enum
  Router = 'Router',
}

export enum SwarmMode {
  SecurityService = 'Security Service',
  InformalCollaborators = 'Informal Collaborators',
  TheRoundTable = 'The Round Table', // FEATURE 1
}

export enum ChatMode {
  Normal = 'Normal',
  Developer = 'Developer',
}

export enum Persona {
  Default = 'Default',
  Creative = 'Creative',
  Concise = 'Concise',
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export interface RagSource {
  documentName: string;
  chunkContent: string;
  similarityScore?: number;
  rerankScore?: number;
}

// MANDATE 3.1
export interface ReflexionEntry {
  id?: number;
  promptEmbedding: number[]; // For semantic search
  original_prompt: string;
  failed_output: string;
  critique: string;
  successful_fix: string;
}

export interface RepoData {
  url:string;
  owner: string;
  repo: string;
  fileTree?: string;
  error?: string;
}

export interface PlanStep {
  step_id: number;
  description: string;
  tool_to_use: string;
  acceptance_criteria: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  dependencies: number[]; // DAG SUPPORT: This step depends on the completion of these step_ids.
  result?: string;
  inputs?: string[];
  output_key?: string;
  startTime?: number; // v4.3 Operator Overhaul
  endTime?: number;   // v4.3 Operator Overhaul
}

export interface Plan {
  id: string;
  plan: PlanStep[];
}

export interface FunctionCall {
    id: string;
    name: string;
    args: Record<string, any>;
    isAwaitingExecution?: boolean;
}

export interface CritiqueScores {
  faithfulness: number;
  coherence: number;
  coverage: number;
}

export interface CritiqueResult {
  scores: CritiqueScores;
  critique: string;
}

export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowStepState {
  status: WorkflowStepStatus;
  details?: any; // Can hold logs, errors, or results
  startTime?: number;
  endTime?: number;
}

export type WorkflowState = Record<string, WorkflowStepState>; // Key is node ID

export interface VizSpec {
  type: 'bar' | 'line' | 'pie';
  data: any[];
  dataKey: string;
  categoryKey: string;
}

export interface PyodideExecutionResult {
  stdout: string;
  stderr: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  file?: FileData;
  repo?: RepoData;
  sources?: GroundingSource[];
  ragSources?: RagSource[];
  isLoading?: boolean;
  plan?: Plan;
  functionCalls?: FunctionCall[];
  functionResponse?: {
    name: string;
    response: any;
  };
  critique?: CritiqueResult;
  supervisorReport?: string;
  taskType?: TaskType;
  workflowState?: WorkflowState;
  vizSpec?: VizSpec;
  followUpSuggestions?: string[];
}

export interface FileData {
  name: string;
  type: string;
  content: string; // base64 encoded
}

export interface AgenticState {
  activePlanId?: string;
  currentPlanStepId?: number;
}

export interface SessionState {
  version: string;
  messages: ChatMessage[];
  agenticState: AgenticState;
}

// Represents a node in our execution graph.
// It's either a specialist agent (TaskType) or a terminal state.
export type GraphNode = TaskType | 'A_FINAL' | 'USER_INPUT';

// This is the main "state" object that will be passed around the graph.
// It's the "memory" of the Supervisor.
export interface GraphState {
  id: string; // The ID of the assistant message holding this graph
  originalPrompt: string;
  plan: Plan | null;
  history: ChatMessage[]; // Internal history of the graph execution
  lastOutput: any; // The raw output from the last-run agent
  nextAgent: GraphNode; // The "pointer" for the state machine
  error: string | null;
}