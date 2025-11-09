

export enum TaskType {
  Chat = 'Chat',
  Research = 'Research',
  Complex = 'Complex',
  Planner = 'Planner',
  Vision = 'Vision',
  Code = 'Code',
  Creative = 'Creative',
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  file?: {
    name: string;
    type: string;
  };
  repo?: RepoData;
  sources?: GroundingSource[];
  isLoading?: boolean;
  plan?: Plan;
  functionCalls?: FunctionCall[];
  taskType?: TaskType; // Used for visualization of the loading message
}

export interface FileData {
  name: string;
  type: string;
  content: string; // base64 encoded
}