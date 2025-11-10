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
  // New fields for execution tracking
  status?: 'pending' | 'in-progress' | 'completed' | 'failed';
  result?: string;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  file?: FileData;
  repo?: RepoData;
  sources?: GroundingSource[];
  isLoading?: boolean;
  plan?: Plan;
  functionCalls?: FunctionCall[];
  functionResponse?: {
    name: string;
    response: any;
  };
  critique?: CritiqueResult;
  taskType?: TaskType; // Used for visualization of the loading message
  currentStep?: number; // For WoT visualization
}

export interface FileData {
  name: string;
  type: string;
  content: string; // base64 encoded
}
