

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
  url: string;
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
}

export interface Plan {
  plan: PlanStep[];
}

export interface FunctionCall {
    name: string;
    args: Record<string, any>;
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
  file?: {
    name: string;
    type: string;
  };
  repo?: RepoData;
  sources?: GroundingSource[];
  isLoading?: boolean;
  plan?: Plan;
  // FIX: Update to support multiple function calls from the API.
  functionCalls?: FunctionCall[]; // A message can have one or more function calls
  functionResponse?: {
    name: string;
    response: any;
  };
  critique?: CritiqueResult;
  taskType?: TaskType; // Used for visualization of the loading message
}

export interface FileData {
  name: string;
  type: string;
  content: string; // base64 encoded
}