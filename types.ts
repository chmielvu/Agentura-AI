
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
  Reranker = 'Reranker', // NEW: SOTA RAG 2.0 Agent
  Maintenance = 'Maintenance', // NEW: Self-diagnostic agent
}

// NEW: Defines the operational mode of the swarm.
export enum SwarmMode {
  SecurityService = 'Security Service',
  InformalCollaborators = 'Informal Collaborators',
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
  rerankScore?: number; // NEW
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
  result?: string;
  inputs?: string[];
  output_key?: string;
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
  supervisorReport?: string; // NEW: For the final swarm evaluation
  taskType?: TaskType;
  workflowState?: WorkflowState;
  vizSpec?: VizSpec;
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