
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Persona, SwarmMode, TaskType, WorkflowState, ChatMessage, FileData, Plan } from '../../types';
import { useModularOrchestrator } from '../hooks/useModularOrchestrator';
import { agentGraphConfigs } from '../components/graphConfigs';
import { useEmbeddingService } from '../hooks/useEmbeddingService';

// Define theme type
type AppTheme = 'sb' | 'abw-light' | 'abw-dark';

// 1. Define the Context's state shape
interface AppContextState {
    // State
    persona: Persona;
    swarmMode: SwarmMode;
    activeRoster: TaskType[];
    messages: ChatMessage[];
    isLoading: boolean;
    lastGraphableTask: { taskType: TaskType; workflowState: WorkflowState } | null;
    feedbackModal: { msgId: string, taskType: TaskType } | null;
    isGuideOpen: boolean;
    explainAgent: any | null;
    isEmbedderReady: boolean;
    embeddingStatus: { title: string; progress: number; total: number } | null;
    theme: AppTheme; // NEW: Theme state

    // Handlers
    handlePersonaChange: (newPersona: Persona) => void;
    handleSwarmModeChange: (newMode: SwarmMode) => void;
    setActiveRoster: (roster: TaskType[]) => void;
    setMessages: (messages: ChatMessage[]) => void;
    handleSendMessage: (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => void;
    handleExecuteCode: (messageId: string, functionCallId: string, codeOverride?: string | undefined) => void;
    handleExecutePlan: (plan: Plan, trace: any[]) => Promise<string>;
    addSessionFeedback: (taskType: TaskType, feedback: string) => void;
    setFeedbackModal: (modal: { msgId: string, taskType: TaskType } | null) => void;
    setIsGuideOpen: (isOpen: boolean) => void;
    setExplainAgent: (agent: any | null) => void;
    handleEmbedFile: (docName: string, text: string) => Promise<void>;
    handleIngestRepo: (url: string) => Promise<void>;
    handleExportSession: () => void;
    toggleTheme: () => void; // NEW: Theme handler
}

// 2. Create the Context
const AppContext = createContext<AppContextState | undefined>(undefined);

// 3. Create the Provider Component
const getInitialSwarmMode = () => (localStorage.getItem('agentic-swarm-mode') as SwarmMode) || SwarmMode.InformalCollaborators;
const INTERNAL_AGENTS = [TaskType.Reranker, TaskType.Embedder, TaskType.Verifier, TaskType.Retry];
const getInitialActiveRoster = () => {
    const saved = localStorage.getItem('agentic-active-roster');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
                return (parsed as TaskType[]).filter(t => !INTERNAL_AGENTS.includes(t));
            }
        } catch (e) { console.error("Failed to parse saved roster:", e); }
    }
    return Object.values(TaskType).filter(t => !INTERNAL_AGENTS.includes(t));
};
const gitHubRepoRegex = /https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [persona, setPersona] = useState<Persona>(() => (localStorage.getItem('agentic-chat-persona') as Persona) || Persona.Default);
    const [swarmMode, setSwarmMode] = useState<SwarmMode>(getInitialSwarmMode);
    const [activeRoster, setActiveRoster] = useState<TaskType[]>(getInitialActiveRoster);
    
    // NEW: Theme state
    const [theme, setTheme] = useState<AppTheme>(() => (localStorage.getItem('agentura-theme') as AppTheme) || 'sb');
    
    // All logic from useModularOrchestrator
    const { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan, addSessionFeedback } = useModularOrchestrator(persona, swarmMode, activeRoster);
    const { messages, isLoading } = state;
    
    const [lastGraphableTask, setLastGraphableTask] = useState<{ taskType: TaskType; workflowState: WorkflowState } | null>(null);
    const [feedbackModal, setFeedbackModal] = useState<{ msgId: string, taskType: TaskType } | null>(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [explainAgent, setExplainAgent] = useState<any | null>(null);
    
    // All logic from useEmbeddingService
    const { isReady: isEmbedderReady, processAndEmbedDocument } = useEmbeddingService();
    const [embeddingStatus, setEmbeddingStatus] = useState<{ title: string; progress: number; total: number } | null>(null);

    // All effects from App.tsx
    useEffect(() => localStorage.setItem('agentic-chat-persona', persona), [persona]);
    useEffect(() => localStorage.setItem('agentic-swarm-mode', swarmMode), [swarmMode]);
    useEffect(() => localStorage.setItem('agentic-active-roster', JSON.stringify(activeRoster)), [activeRoster]);
    useEffect(() => localStorage.setItem('agentura-theme', theme), [theme]); // NEW: Save theme

    useEffect(() => {
        const lastTaskWithMessage = [...messages].reverse().find(m => m.role === 'assistant' && m.taskType && m.workflowState && agentGraphConfigs[m.taskType]);
        if (lastTaskWithMessage) {
            setLastGraphableTask({
                taskType: lastTaskWithMessage.taskType as TaskType,
                workflowState: lastTaskWithMessage.workflowState as WorkflowState,
            });
        }
    }, [messages]);

    useEffect(() => {
        if (!isEmbedderReady) return;
        const ingestGuide = async () => {
            const isIngested = localStorage.getItem('agentic_guide_ingested_v2');
            if (isIngested) return;
            console.log("Ingesting Agentic Guide for the first time...");
            try {
                const guideFiles = [
                    'canvas_assets/guide/01_Introduction.md',
                    'canvas_assets/guide/02_Planning.md',
                    'canvas_assets/guide/03_Reflexion.md',
                    'canvas_assets/guide/04_RAG_and_Self_Augmentation.md',
                    'canvas_assets/guide/05_Reasoning_Patterns.md'
                ];
                setEmbeddingStatus({ title: 'Ingesting Agentic Guide', progress: 0, total: guideFiles.length });
                for (const [index, path] of guideFiles.entries()) {
                    setEmbeddingStatus({ title: `Ingesting: ${path.split('/').pop()}`, progress: index, total: guideFiles.length });
                    const response = await fetch(path);
                    if (!response.ok) throw new Error(`Failed to fetch ${path}`);
                    const text = await response.text();
                    await processAndEmbedDocument(path, text);
                }
                localStorage.setItem('agentic_guide_ingested_v2', 'true');
                setEmbeddingStatus({ title: 'Guide Ingestion Complete!', progress: guideFiles.length, total: guideFiles.length });
                setTimeout(() => setEmbeddingStatus(null), 1500);
            } catch (e) {
                console.error("Failed to ingest agentic guide:", e);
                setEmbeddingStatus(null);
            }
        };
        ingestGuide();
    }, [isEmbedderReady, processAndEmbedDocument]);

    // All handlers from App.tsx
    const handleSwarmModeChange = (newMode: SwarmMode) => {
        if (newMode === swarmMode) return;
        if (messages.length > 0 && window.confirm("Changing swarm mode will clear the conversation. Continue?")) {
            setMessages([]);
        }
        setSwarmMode(newMode);
    };

    const handlePersonaChange = (newPersona: Persona) => {
        if (newPersona === persona) return;
        setPersona(newPersona);
    };
    
    // NEW: Theme toggling logic
    const toggleTheme = () => {
        setTheme(currentTheme => {
            if (currentTheme === 'sb') return 'abw-light';
            if (currentTheme === 'abw-light') return 'abw-dark';
            if (currentTheme === 'abw-dark') return 'sb';
            return 'sb'; // Default fallback
        });
    };

    const handleExportSession = () => {
        let markdownContent = `# Agentura AI Session\n\n*Exported on: ${new Date().toISOString()}*\n\n---\n\n`;
        messages.forEach(msg => {
            if (msg.role === 'user') {
                markdownContent += `> **User:**\n> ${msg.content.replace(/\n/g, '\n> ')}\n\n`;
            } else if (msg.role === 'assistant' && msg.content) {
                markdownContent += `**Assistant (${msg.taskType || 'Chat'}):**\n${msg.content}\n\n`;
            } else if (msg.plan) {
                markdownContent += `**Assistant (Planner):**\n*Generated Plan:*\n`;
                msg.plan.plan.forEach(step => {
                    markdownContent += `1.  **[${step.status.toUpperCase()}]** ${step.description} (Tool: ${step.tool_to_use})\n`;
                    if (step.result && step.status === 'completed') {
                        markdownContent += `    * **Result:** \`${step.result.substring(0, 150).replace(/\n/g, ' ')}...\`\n`;
                    } else if (step.result && step.status === 'failed') {
                        markdownContent += `    * **Failure:** \`${step.result}\`\n`;
                    }
                });
                markdownContent += `\n`;
            }
        });
        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `agentura-session-${Date.now()}.md`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleEmbedFile = async (docName: string, text: string) => {
        setEmbeddingStatus({ title: `Embedding ${docName}`, progress: 0, total: 1 });
        try {
            await processAndEmbedDocument(docName, text, ({ current, total }) => {
                setEmbeddingStatus({ title: `Embedding ${docName}`, progress: current, total });
            });
            setEmbeddingStatus({ title: `Embedded ${docName}`, progress: 1, total: 1 });
            setTimeout(() => setEmbeddingStatus(null), 1500);
        } catch (e) {
            console.error(e);
            alert(`Failed to embed ${docName}.`);
            setEmbeddingStatus(null);
        }
    };

    const handleIngestRepo = async (url: string) => {
        const match = url.match(gitHubRepoRegex);
        if (!match) return;
        const [_, owner, repo] = match;
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
        try {
            setEmbeddingStatus({ title: `Fetching repo tree for ${repo}...`, progress: 0, total: 1 });
            // ... (rest of the ingest logic) ...
            alert("Repo ingestion logic would run here.");
        } catch (e) {
            const error = e as Error;
            alert(`Failed to fetch repository. Error: ${error.message}`);
            setEmbeddingStatus(null);
        }
    };

    // 4. Value provided to consumers
    const value: AppContextState = {
        persona,
        swarmMode,
        activeRoster,
        messages,
        isLoading,
        lastGraphableTask,
        feedbackModal,
        isGuideOpen,
        explainAgent,
        isEmbedderReady,
        embeddingStatus,
        theme, // NEW
        handlePersonaChange,
        handleSwarmModeChange,
        setActiveRoster,
        setMessages,
        handleSendMessage,
        handleExecuteCode,
        handleExecutePlan,
        addSessionFeedback,
        setFeedbackModal,
        setIsGuideOpen,
        setExplainAgent,
        handleEmbedFile,
        handleIngestRepo,
        handleExportSession,
        toggleTheme // NEW
    };

    // NEW: Wrap children in a div with the theme class
    return (
        <div className={theme}>
            <AppContext.Provider value={value}>{children}</AppContext.Provider>
        </div>
    );
};

// 5. Custom hook for easy consumption
export const useAppContext = (): AppContextState => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
