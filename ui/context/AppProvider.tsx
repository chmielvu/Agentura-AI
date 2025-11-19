
import React, { useEffect } from 'react';
import { create } from 'zustand';
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Type } from '@google/genai';

import { Persona, SwarmMode, TaskType, ChatMessage, FileData, Plan, PlanStep, WorkflowState, GraphState, GraphNode, GroundingSource, FunctionCall, VizSpec, ReflexionEntry, PyodideExecutionResult } from '../../types';
import { APP_VERSION, AGENT_ROSTER, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL, SUPERVISOR_SYSTEM_INSTRUCTION, SUPERVISOR_ROUTER_TOOL, CRITIQUE_TOOL } from '../../constants';
import { agentGraphConfigs } from '../components/graphConfigs';

import { fileToGenerativePart, extractSources, withRetry } from '../hooks/helpers';
import { embeddingService } from '../hooks/useEmbeddingService';
import { db } from '../hooks/useDB';

type AppTheme = 'sb' | 'wsi-light' | 'wsi-dark';
const gitHubRepoRegex = /https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/;

// 1. Define the Zustand store's state and actions shape
interface AppState {
    // State
    persona: Persona;
    swarmMode: SwarmMode;
    activeRoster: TaskType[];
    messages: ChatMessage[];
    isLoading: boolean;
    feedbackModal: { msgId: string, taskType: TaskType } | null;
    isGuideOpen: boolean;
    explainAgent: any | null;
    embeddingStatus: { title: string; progress: number; total: number } | null;
    theme: AppTheme;
    sessionFeedback: Record<string, string[]>;
    lastGraphableTask: { taskType: TaskType, workflowState: WorkflowState } | null;
    pyodide: any | null;
    isPyodideReady: boolean;
    isEmbedderReady: boolean;

    // Actions
    setPersona: (newPersona: Persona) => void;
    setSwarmMode: (newMode: SwarmMode) => void;
    setActiveRoster: (roster: TaskType[]) => void;
    setMessages: (messages: ChatMessage[]) => void;
    handleSendMessage: (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => Promise<void>;
    addSessionFeedback: (taskType: TaskType, feedback: string) => void;
    setFeedbackModal: (modal: { msgId: string, taskType: TaskType } | null) => void;
    setIsGuideOpen: (isOpen: boolean) => void;
    setExplainAgent: (agent: any | null) => void;
    handleEmbedFile: (docName: string, text: string) => Promise<void>;
    handleIngestRepo: (url: string) => Promise<void>;
    handleExportSession: () => void;
    toggleTheme: () => void;
    handleExecuteCode: (messageId: string, functionCallId: string, overrideCode?: string) => Promise<void>;
    handleExecutePlan: (planToExecute: Plan, completedSteps: number[]) => Promise<void>;
    // Internal Actions (previously reducer cases)
    _addMessage: (message: ChatMessage) => void;
    _updateMessage: (messageId: string, update: Partial<ChatMessage>) => void;
    _setLoading: (isLoading: boolean) => void;
    _updatePlanStep: (planId, stepId: number, status: PlanStep['status'], result?: string) => void;
}

const safeLocalStorageGet = (key: string, defaultValue: any) => {
    if (typeof window === 'undefined' || !window.localStorage) {
        return defaultValue;
    }
    try {
        const item = localStorage.getItem(key);
        // Use JSON.parse only if item is not null, otherwise return default
        return item ? JSON.parse(item) : defaultValue;
    } catch (e) {
        console.warn(`Could not access or parse localStorage for key "${key}". Using default value.`, e);
        return defaultValue;
    }
};

// 2. Create the Zustand store
const useAppStore = create<AppState>((set, get) => {
    // Helper function to format API errors
    const formatApiError = (e: any, agentName: string = "Agent"): string => {
        console.error(`API Error for ${agentName}:`, e);
        const errorMessage = e?.message ? `Details: ${e.message}` : "An unknown error occurred.";
        return `**${agentName} failed due to an API error.**\nThis could be a temporary network issue. Please check your developer console for details.\n\n*${errorMessage}*`;
    };

    // Helper to get AI client lazily
    const getAiClient = () => {
        // Safety check for process global to avoid ReferenceError in strict browser envs
        const apiKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
        
        if (!apiKey) {
             console.error("API_KEY is missing from process.env");
             throw new Error("API Key is not configured.");
        }
        return new GoogleGenAI({ apiKey: apiKey });
    };

    const getChat = (taskType: TaskType, history: ChatMessage[] = []): Chat => {
        const agentConfig = AGENT_ROSTER[taskType];
        const { persona, sessionFeedback } = get();
        const personaInstruction = PERSONA_CONFIGS[persona].instruction;
        let systemInstruction = [personaInstruction, agentConfig.systemInstruction].filter(Boolean).join('\n\n');
        const feedbackForAgent = sessionFeedback[taskType];
        if (feedbackForAgent?.length > 0) {
            systemInstruction += "\n\n--- CRITICAL USER FEEDBACK (MUST FOLLOW) ---\n" + feedbackForAgent.map((f, i) => `${i+1}. ${f}`).join('\n');
        }

        // Explicit return type annotation to fix TypeScript inference
        const geminiHistory = history.flatMap((m): { role: 'user' | 'model', parts: Part[] }[] => {
            if (m.role === 'user') {
                const parts: Part[] = [{ text: m.content }];
                if (m.file) parts.push(fileToGenerativePart(m.file));
                return [{ role: 'user' as const, parts }];
            }
            if (m.role === 'assistant') {
                const parts: Part[] = [];
                // Only add text if there is content, otherwise Gemini API might error on empty parts
                if (m.content) parts.push({ text: m.content });
                if (m.functionCalls) {
                    parts.push(...m.functionCalls.map(fc => ({ functionCall: { name: fc.name, args: fc.args } })));
                }
                // Ensure there is at least one part if the role is assistant
                if (parts.length === 0) {
                    parts.push({text: ""}); // Add empty text part if no content or function calls
                }
                return [{ role: 'model' as const, parts }];
            }
            if (m.role === 'tool' && m.functionResponse) {
                 return [{
                    role: 'model' as const, // Gemini API expects tool responses to be from the 'model' role in history for the 'Chat' class
                    parts: [{ functionResponse: { name: m.functionResponse.name, response: m.functionResponse.response } }]
                }];
            }
            return [];
        });

        const ai = getAiClient();
        return ai.chats.create({
            model: agentConfig.model,
            config: { ...agentConfig.config, tools: agentConfig.tools, ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }) },
            history: geminiHistory
        });
    };

    const processStream = async (stream: AsyncGenerator<GenerateContentResponse>, assistantMessageId: string, isGraphStep: boolean, onStreamUpdate?: (streamedText: string) => void) => {
        let fullText = '', sources: GroundingSource[] = [], functionCalls: FunctionCall[] = [];
        for await (const chunk of stream) {
            if (chunk.text) fullText += chunk.text;
            if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls.map(fc => ({ id: `fc-${Date.now()}-${Math.random()}`, name: fc.name, args: fc.args })));
            const newSources = extractSources(chunk);
            sources = Array.from(new Map([...sources, ...newSources].map(s => [s.uri, s])).values());
            if (onStreamUpdate) onStreamUpdate(fullText);

            if (!isGraphStep) {
                 get()._updateMessage(assistantMessageId, { content: fullText, sources, functionCalls });
            }
        }
        return { fullText, sources, functionCalls };
    };

    const handleSendMessageInternal = async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isGraphStep: boolean = false, manageLoadingState: boolean = true, onStreamUpdate?: (streamedText: string) => void): Promise<ChatMessage> => {
        const assistantMsgId = isGraphStep ? `step-${Date.now()}-${Math.random()}` : Date.now().toString();
        let routedTask = forcedTask;

        try {
            if (!routedTask) {
                const routerHistory = get().messages.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: m.content }] }));
                const ai = getAiClient();
                const routerResp = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({ 
                    model: 'gemini-2.5-flash', 
                    contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], 
                    config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }
                }));
                const proposedRoute = routerResp.functionCalls?.[0]?.args.route as TaskType | undefined;
                routedTask = proposedRoute && AGENT_ROSTER.hasOwnProperty(proposedRoute) ? proposedRoute : TaskType.Chat;
            } else if (!isGraphStep) {
                get()._addMessage({ id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: routedTask });
            }

            if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
            if(!isGraphStep) get()._updateMessage(assistantMsgId, { taskType: routedTask });
            
            const chat = getChat(routedTask!, get().messages);
            const parts: Part[] = [{ text: prompt }];
            if (file) parts.push(fileToGenerativePart(file));
            
            const stream = await withRetry<AsyncGenerator<GenerateContentResponse>>(() => chat.sendMessageStream({ message: { role: 'user', parts } }));
            const streamOutput = await processStream(stream, assistantMsgId, isGraphStep, onStreamUpdate);
            
            let vizSpec: VizSpec | undefined = undefined;
            if (routedTask === TaskType.DataAnalyst) {
                const vizCall = streamOutput.functionCalls.find(fc => fc.name === 'submit_visualization_spec');
                vizSpec = vizCall?.args as VizSpec;
            }

            const finalMessage: ChatMessage = { id: assistantMsgId, role: 'assistant', content: streamOutput.fullText, isLoading: false, sources: streamOutput.sources, functionCalls: streamOutput.functionCalls, ragSources: [], vizSpec, taskType: routedTask };
            if (!isGraphStep) get()._updateMessage(assistantMsgId, finalMessage);
            return finalMessage;
        } catch(e) {
            const agentName = AGENT_ROSTER[routedTask!]?.title || 'Router';
            const formattedError = formatApiError(e, agentName);
            if (!isGraphStep) {
                get()._updateMessage(assistantMsgId, { isLoading: false, content: formattedError });
                if (manageLoadingState) get()._setLoading(false);
            }
            throw new Error(formattedError);
        }
    };
    
    // The Supervisor Loop (Parallel Execution Engine)
    const runGraph = async (state: GraphState) => {
      const updateGraphHistory = (report: string) => {
        state.history.push({ id: `graph-step-${Date.now()}`, role: 'assistant', content: report, taskType: TaskType.Supervisor });
        get()._updateMessage(state.id, { supervisorReport: state.history.map(m => m.content).join('\n') });
      };

      while (state.nextAgent !== 'A_FINAL') {
        let currentNode = state.nextAgent as TaskType;
        let fileData: FileData | undefined = state.history.find(m => m.role === 'user')?.file;

        // --- 1. CHECK FOR PARALLEL PLAN EXECUTION ---
        if (state.plan && state.plan.plan.length > 0) {
             const plan = state.plan;
             const completedStepIds = new Set(plan.plan.filter(s => s.status === 'completed').map(s => s.step_id));
             
             // Identify all steps that are pending and have all dependencies met
             const runnableSteps = plan.plan.filter(s => 
                 s.status === 'pending' && 
                 (s.dependencies || []).every(depId => completedStepIds.has(depId))
             );

             if (runnableSteps.length > 0) {
                 updateGraphHistory(`\n---⚡ PARALLEL EXECUTION: Running ${runnableSteps.length} steps...`);
                 
                 // Mark all as in-progress first
                 runnableSteps.forEach(step => get()._updatePlanStep(plan.id, step.step_id, 'in-progress', 'Starting parallel execution...'));

                 // Execute all runnable steps in parallel using Promise.all
                 await Promise.all(runnableSteps.map(async (step) => {
                     try {
                        await executeStep(step, plan, state, fileData);
                     } catch (e) {
                        console.error(`Step ${step.step_id} failed:`, e);
                        get()._updatePlanStep(plan.id, step.step_id, 'failed', (e as Error).message);
                        updateGraphHistory(`\n---❌ Step ${step.step_id} failed: ${(e as Error).message}`);
                     }
                 }));
                 
                 // Loop back immediately to check for next set of runnable steps or completion
                 // This avoids calling the Supervisor LLM if we are just churning through the plan
                 continue;
             }
        }

        // --- 2. DETERMINISTIC ORCHESTRATION (LLM ROUTING) ---
        // If no plan steps could be run deterministically, we ask the Supervisor LLM what to do.
        try {
          // Special handling for Planner and Critique (Meta-Agents)
          if (currentNode === TaskType.Planner) {
               updateGraphHistory(`\n---▶ Supervisor: Calling \`Planner\`...`);
               const stateJson = JSON.stringify({ ...state, history: state.history.slice(-3) }, null, 2);
               const pastLessons: ReflexionEntry[] = await db.findSimilarReflexions(await embeddingService.generateEmbedding(state.originalPrompt), 2);
               const lessonText = pastLessons.length > 0 ? `PREVIOUS FAILED ATTEMPTS (for learning):\n${JSON.stringify(pastLessons)}` : "N/A";
               const plannerPrompt = AGENT_ROSTER[TaskType.Planner].systemInstruction
                    .replace('{graph_state_json}', stateJson)
                    .replace('{past_lessons}', lessonText);

                const agentResponse = await handleSendMessageInternal(plannerPrompt, fileData, undefined, TaskType.Planner, true, false);
                const planCall = agentResponse.functionCalls?.find(fc => fc.name === 'submit_plan');
                if (!planCall || !planCall.args.plan) throw new Error("Planner agent did not return a valid plan structure.");
                state.plan = { id: `plan-${state.id}`, plan: planCall.args.plan.map((step: any) => ({ ...step, status: 'pending' })) };
                state.lastOutput = state.plan;
                get()._updateMessage(state.id, { plan: state.plan });
                updateGraphHistory(`Planner output: Plan with ${state.plan.plan.length} steps.`);

          } else if (currentNode === TaskType.Critique) {
                updateGraphHistory(`\n---▶ Supervisor: Calling \`Critique\`...`);
                const critiquePrompt = `Critique the last output based on the original goal. \n[Original Goal]: ${state.originalPrompt}\n[Last Failed Output]: ${JSON.stringify(state.lastOutput, null, 2)}`;
                const agentResponse = await handleSendMessageInternal(critiquePrompt, fileData, undefined, TaskType.Critique, true, false);
                const critiqueCall = agentResponse.functionCalls?.find(fc => fc.name === CRITIQUE_TOOL.name);
                if (!critiqueCall) throw new Error("Critique agent failed to provide a valid critique.");
                state.lastOutput = critiqueCall.args;
                updateGraphHistory(`Critique output: ${critiqueCall.args.critique}`);
          } 
          // Note: Normal workers are handled by the parallel block above. If we reach here with a worker node,
          // it implies a direct routing or a single-step fallback.
          
        } catch (e: any) {
            const errorMsg = e.message || "An unknown execution error occurred.";
            updateGraphHistory(`\n---❌ ERROR in \`${currentNode}\`: ${errorMsg}`);
            state.error = errorMsg;
            state.lastOutput = { error: errorMsg, agent: currentNode };
        }

        // --- 3. SUPERVISOR DECISION ---
        const supervisorPrompt = SUPERVISOR_SYSTEM_INSTRUCTION.replace('{graph_state_json}', JSON.stringify({ ...state, history: state.history.slice(-3) }, null, 2));
        const supervisorMsg = await handleSendMessageInternal(supervisorPrompt, undefined, undefined, TaskType.Supervisor, true, false);
        const routeCall = supervisorMsg.functionCalls?.find(fc => fc.name === SUPERVISOR_ROUTER_TOOL.name);

        if (!routeCall || !routeCall.args.agent_to_call) {
          const errorText = "Supervisor failed to route. Halting graph. This could be a temporary model issue.";
          updateGraphHistory(`\n---🛑 FATAL ERROR: ${errorText}`);
          get()._updateMessage(state.id, { content: `**Execution Failed:** ${errorText}`});
          state.nextAgent = 'A_FINAL';
        } else {
          state.nextAgent = routeCall.args.agent_to_call as GraphNode;
          updateGraphHistory(`Supervisor decision: Route to \`${state.nextAgent}\`. Reason: ${routeCall.args.reasoning}`);
        }
      }

      updateGraphHistory(`\n---✅ Graph complete. Final output generated.`);
      return state.lastOutput;
    };

    // Helper to execute a single step (used in parallel loop)
    const executeStep = async (step: PlanStep, plan: Plan, state: GraphState, fileData?: FileData) => {
        const agentType = step.tool_to_use as TaskType;
        get()._updatePlanStep(plan.id, step.step_id, 'in-progress', 'Executing...');

        const planStateSummary = plan.plan.map(p => {
            const isCurrent = p.step_id === step.step_id;
            return `  - Step ${p.step_id} (${p.tool_to_use}): ${p.status}${isCurrent ? ' <-- YOUR CURRENT STEP' : ''}`;
        }).join('\n');

        const agentPrompt = `
You are an expert agent executing one step of a larger plan. Your response must be the direct output for YOUR CURRENT STEP only. Do not add conversational filler.

### CONTEXT: OVERALL GOAL
${state.originalPrompt}

### CONTEXT: FULL PLAN STATE
Here is the current status of all steps in the plan.
${planStateSummary}

### YOUR CURRENT TASK
Your job is to execute the step marked "<-- YOUR CURRENT STEP".
- **Description:** ${step.description}
- **Acceptance Criteria:** ${step.acceptance_criteria || 'N/A'}

First, internally reflect on how your task contributes to the overall goal. Then, perform the action and provide only the result.
`;
        // Execute agent
        const agentResponse = await handleSendMessageInternal(agentPrompt, fileData, undefined, agentType, true, false, (streamedText) => {
            get()._updatePlanStep(plan.id, step.step_id, 'in-progress', streamedText + ' |');
        });

        // Update state
        state.lastOutput = agentResponse.content;
        get()._updatePlanStep(plan.id, step.step_id, 'completed', state.lastOutput);
        
        // Add to history for context
        state.history.push({
             id: `step-${step.step_id}-result`,
             role: 'assistant',
             content: `[Step ${step.step_id} Result]: ${state.lastOutput}`,
             taskType: agentType
        });
    };

    const generateFollowUps = async (history: ChatMessage[], targetMessage: ChatMessage) => {
        try {
            const prompt = `Based on the following conversation, suggest exactly 3 concise and relevant follow-up questions or actions a user might take next.
            Prioritize actions that use agent commands like /research, /code, etc.
            
            CONVERSATION HISTORY (most recent messages):
            ${history.slice(-4).map(m => `${m.role.toUpperCase()}: ${m.content.substring(0, 300)}`).join('\n---\n')}
            `;

            const schema = {
                type: Type.OBJECT,
                properties: {
                    suggestions: {
                        type: Type.ARRAY,
                        description: "An array of exactly 3 string suggestions.",
                        items: { type: Type.STRING }
                    }
                },
                required: ['suggestions']
            };

            const ai = getAiClient();
            const response = await withRetry<GenerateContentResponse>(() => ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { responseMimeType: "application/json", responseSchema: schema }
            }));
            
            let suggestions: string[] = [];
            try {
                const parsed = JSON.parse(response.text || '{}');
                if (parsed.suggestions && Array.isArray(parsed.suggestions)) {
                    suggestions = parsed.suggestions;
                }
            } catch (e) {
                console.warn("Follow-up suggestion generation returned non-JSON.", e);
            }

            get()._updateMessage(targetMessage.id, { followUpSuggestions: suggestions });

        } catch (e) {
            console.error("Failed to generate follow-up suggestions:", e);
            // Set to empty array on failure so it doesn't show loading forever
            get()._updateMessage(targetMessage.id, { followUpSuggestions: [] });
        }
    };
    
    // Atomically load session from localStorage for initial state
    const savedState = safeLocalStorageGet('agentic-session', null);
    const initialMessages = (savedState && savedState.version === APP_VERSION) ? savedState.messages : [];

    return {
        // Initial State
        persona: safeLocalStorageGet('agentic-chat-persona', Persona.Default),
        swarmMode: safeLocalStorageGet('agentic-swarm-mode', SwarmMode.InformalCollaborators),
        activeRoster: safeLocalStorageGet('agentic-active-roster', []),
        messages: initialMessages,
        isLoading: false,
        feedbackModal: null,
        isGuideOpen: false,
        explainAgent: null,
        embeddingStatus: null,
        theme: safeLocalStorageGet('agentura-theme', 'sb'),
        sessionFeedback: {},
        lastGraphableTask: null,
        pyodide: null,
        isPyodideReady: false,
        isEmbedderReady: false,

        // Actions
        setPersona: (newPersona) => set(state => {
            if (newPersona === state.persona) return {};
            try { localStorage.setItem('agentic-chat-persona', JSON.stringify(newPersona)); } catch (e) { console.warn('Could not save persona to localStorage.')}
            return { persona: newPersona };
        }),
        setSwarmMode: (newMode) => set(state => {
            if (newMode === state.swarmMode) return {};
            if (state.messages.length > 0 && window.confirm("Changing swarm mode will clear the conversation. Continue?")) {
                try { localStorage.setItem('agentic-swarm-mode', JSON.stringify(newMode)); } catch (e) { console.warn('Could not save swarmMode to localStorage.')}
                return { swarmMode: newMode, messages: [] };
            } else if (state.messages.length === 0) {
                 try { localStorage.setItem('agentic-swarm-mode', JSON.stringify(newMode)); } catch (e) { console.warn('Could not save swarmMode to localStorage.')}
                return { swarmMode: newMode };
            }
            return {};
        }),
        setActiveRoster: (roster) => {
            try { localStorage.setItem('agentic-active-roster', JSON.stringify(roster)); } catch (e) { console.warn('Could not save activeRoster to localStorage.')}
            set({ activeRoster: roster });
        },
        setMessages: (messages) => set({ messages }),
        handleSendMessage: async (prompt, file, repoUrl, forcedTask) => {
            const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file, repo: repoUrl ? { url: repoUrl, owner: '', repo: '' } : undefined };
            set(state => ({ isLoading: true, messages: [...state.messages, userMsg] }));

            const assistantMsgId = (parseInt(userMsg.id) + 1).toString();
            const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: 'Supervisor: Initializing graph...', isLoading: true, taskType: TaskType.Supervisor, supervisorReport: 'Supervisor: Initializing graph...'};
            get()._addMessage(assistantMsg);

            const initialState: GraphState = { id: assistantMsgId, originalPrompt: prompt, plan: null, history: [userMsg], lastOutput: null, nextAgent: forcedTask || TaskType.Planner, error: null };

            try {
                const finalOutput = await runGraph(initialState);
                const finalContent = (typeof finalOutput === 'string' || !finalOutput) ? (finalOutput || "Graph complete.") : JSON.stringify(finalOutput, null, 2);
                get()._updateMessage(assistantMsgId, { content: finalContent, isLoading: false });

                // Generate follow-ups after success
                const finalMessage = get().messages.find(m => m.id === assistantMsgId);
                if (finalMessage) {
                    generateFollowUps(get().messages, finalMessage);
                }
            } catch (e) {
                 const error = e as Error;
                get()._updateMessage(assistantMsgId, { content: `Graph execution failed: ${error.message}`, isLoading: false, followUpSuggestions: [] });
            } finally {
                get()._setLoading(false);
            }
        },
        addSessionFeedback: (taskType, feedback) => set(state => ({
            sessionFeedback: { ...state.sessionFeedback, [taskType]: [...(state.sessionFeedback[taskType] || []), feedback] }
        })),
        setFeedbackModal: (modal) => set({ feedbackModal: modal }),
        setIsGuideOpen: (isOpen) => set({ isGuideOpen: isOpen }),
        setExplainAgent: (agent) => set({ explainAgent: agent }),
        toggleTheme: () => set(state => {
            const newTheme = state.theme === 'sb' ? 'wsi-light' : state.theme === 'wsi-light' ? 'wsi-dark' : 'sb';
            try { localStorage.setItem('agentura-theme', JSON.stringify(newTheme)); } catch(e) { console.warn('Could not save theme to localStorage.')}
            return { theme: newTheme };
        }),
        handleEmbedFile: async (docName, text) => {
            set({ embeddingStatus: { title: `Embedding ${docName}`, progress: 0, total: 1 }});
            try {
                await embeddingService.processAndEmbedDocument(docName, text, ({ current, total }) => {
                    set({ embeddingStatus: { title: `Embedding ${docName}`, progress: current, total }});
                });
                setTimeout(() => set({ embeddingStatus: null }), 1500);
            } catch (e) {
                console.error(e);
                alert(`Failed to embed ${docName}.`);
                set({ embeddingStatus: null });
            }
        },
        handleIngestRepo: async (url) => { /* Placeholder for brevity */ },
        handleExportSession: () => { /* Placeholder for brevity */ },
        handleExecutePlan: async (planToExecute, completedSteps) => {
            const messageWithPlan = get().messages.find(m => m.plan?.id === planToExecute.id);
            if (!messageWithPlan) {
                console.error("Could not find message for plan execution.");
                return;
            }

            get()._setLoading(true);

            // Determine the first runnable step in JS to avoid the error-driven flow.
            const completedStepIds = new Set(planToExecute.plan.filter(s => completedSteps.includes(s.step_id) || s.status === 'completed').map(s => s.step_id));
            const runnableSteps = planToExecute.plan.filter(s => s.status === 'pending' && (s.dependencies || []).every(depId => completedStepIds.has(depId)));
            const firstRunnable = runnableSteps.sort((a,b) => a.step_id - b.step_id)[0];

            if (!firstRunnable) {
                console.warn("handleExecutePlan: No runnable steps found. The plan may be complete or deadlocked.");
            }

            const initialState: GraphState = {
                id: messageWithPlan.id,
                originalPrompt: get().messages.find(m => m.role === 'user')?.content || "Execute the provided plan.",
                plan: planToExecute,
                history: get().messages.filter(m => parseInt(m.id) < parseInt(messageWithPlan.id)),
                lastOutput: null,
                nextAgent: firstRunnable ? firstRunnable.tool_to_use as TaskType : TaskType.Supervisor,
                error: null
            };
            
            if (completedSteps.length > 0 && initialState.plan) {
                initialState.plan.plan.forEach(step => {
                    if (completedSteps.includes(step.step_id)) {
                        step.status = 'completed';
                        step.result = 'Pre-completed by user.';
                    }
                });
            }
            
            get()._updateMessage(messageWithPlan.id, { plan: initialState.plan });

            try {
                await runGraph(initialState);
            } catch (e) {
                const error = e as Error;
                console.error("Plan execution failed", error);
                const errorMsg: ChatMessage = { id: `err-${Date.now()}`, role: 'assistant', content: `Plan execution failed: ${error.message}` };
                get()._addMessage(errorMsg);
            } finally {
                get()._setLoading(false);
            }
        },
        handleExecuteCode: async (messageId, functionCallId, overrideCode) => {
            get()._setLoading(true);
        
            const { messages, pyodide } = get();
            const message = messages.find(m => m.id === messageId);
            const functionCall = message?.functionCalls?.find(fc => fc.id === functionCallId);
        
            if (!message || !functionCall || !pyodide) {
                console.error("Pyodide not ready or function call not found.");
                get()._setLoading(false);
                return;
            }
        
            // Mark the function call as being executed
            get()._updateMessage(messageId, {
                functionCalls: message.functionCalls?.map(fc =>
                    fc.id === functionCallId ? { ...fc, isAwaitingExecution: false } : fc
                )
            });
        
            let result: PyodideExecutionResult;
            try {
                // Redirect stdout and stderr
                await pyodide.runPythonAsync(`
                    import sys
                    import io
                    sys.stdout = io.StringIO()
                    sys.stderr = io.StringIO()
                `);
        
                // Execute the user's code
                const codeToRun = overrideCode || functionCall.args.code;
                await pyodide.runPythonAsync(codeToRun);
        
                // Capture the output
                const stdout = await pyodide.runPythonAsync("sys.stdout.getvalue()");
                const stderr = await pyodide.runPythonAsync("sys.stderr.getvalue()");
                result = { stdout, stderr: stderr || null };
        
            } catch (e) {
                const error = e as Error;
                result = { stdout: '', stderr: error.message };
            }
        
            // Create a tool message with the execution result
            const toolResponseMsg: ChatMessage = {
                id: `tool-${functionCall.id}`,
                role: 'tool',
                content: `Tool response for ${functionCall.name}`,
                functionResponse: { name: functionCall.name, response: result }
            };
            get()._addMessage(toolResponseMsg);
        
            // Now, re-prompt the agent with the result to continue the loop
            const assistantResponseId = `assistant-${functionCall.id}`;
            get()._addMessage({ id: assistantResponseId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Code });
            
            const historyForContinuation = [...get().messages];
            const chat = getChat(TaskType.Code, historyForContinuation);
            
            try {
                const stream = await withRetry<AsyncGenerator<GenerateContentResponse>>(() => chat.sendMessageStream({ message: { role: 'user', parts: [{ text: "The code has been executed. Analyze the result and continue." }] } }));
                const { fullText, sources, functionCalls } = await processStream(stream, assistantResponseId, false);
                get()._updateMessage(assistantResponseId, { content: fullText, isLoading: false, sources, functionCalls });
            } catch (e) {
                const formattedError = formatApiError(e, "Code Agent (Continuation)");
                get()._updateMessage(assistantResponseId, { isLoading: false, content: formattedError });
            } finally {
                get()._setLoading(false);
            }
        },
        
        // Internal Actions
        _addMessage: (message) => set(state => ({ messages: [...state.messages, message] })),
        _updateMessage: (messageId, update) => set(state => ({ messages: state.messages.map(msg => msg.id === messageId ? { ...msg, ...update } : msg) })),
        _setLoading: (isLoading) => set({ isLoading }),
        _updatePlanStep: (planId, stepId, status, result) => set(state => ({
            messages: state.messages.map(msg => {
                if (msg.plan?.id === planId) {
                    const newPlan = {
                        ...msg.plan,
                        plan: msg.plan.plan.map(step => {
                            if (step.step_id === stepId) {
                                const newStep = { ...step, status, ...(result !== undefined && { result }) };
                                if (status === 'in-progress' && !step.startTime) newStep.startTime = Date.now();
                                if ((status === 'completed' || status === 'failed') && !step.endTime) newStep.endTime = Date.now();
                                return newStep;
                            }
                            return step;
                        })
                    };
                    return { ...msg, plan: newPlan };
                }
                return msg;
            }),
        })),
    };
});

// Persist state to localStorage on changes
useAppStore.subscribe(
  (state) => {
    if (typeof window !== 'undefined' && window.localStorage) {
        try {
            const sessionState = { version: APP_VERSION, messages: state.messages };
            localStorage.setItem('agentic-session', JSON.stringify(sessionState));
        } catch (e) { console.error("Failed to save session", e); }
    }
  }
);


// 3. Create the Provider Component and context hook
// The Provider is now just a simple component to manage the theme class and initial hydration effects.
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const theme = useAppStore((state) => state.theme);
    
    // Effect to initialize background services and ingest guide on initial load
    useEffect(() => {
        const initializeServices = async () => {
            const setStatus = (status: { title: string, progress: number, total: number } | null) => {
                useAppStore.setState({ embeddingStatus: status });
            };

            try {
                await embeddingService.initialize();
                useAppStore.setState({ isEmbedderReady: true });
                console.log("Embedding service is ready.");

                const isIngested = localStorage.getItem('agentic_guide_ingested_v2');
                if (isIngested) return;

                const guideFiles = ['canvas_assets/guide/01_Introduction.md','canvas_assets/guide/02_Planning.md','canvas_assets/guide/03_Reflexion.md','canvas_assets/guide/04_RAG_and_Self_Augmentation.md','canvas_assets/guide/05_Reasoning_Patterns.md'];
                for (const [index, path] of guideFiles.entries()) {
                    setStatus({ title: `Ingesting: ${path.split('/').pop()}`, progress: index + 1, total: guideFiles.length });
                    const text = await (await fetch(path)).text();
                    await embeddingService.processAndEmbedDocument(path, text);
                }
                localStorage.setItem('agentic_guide_ingested_v2', 'true');
                setTimeout(() => setStatus(null), 1500);
            } catch (e) {
                console.error("Failed to initialize services or ingest guide:", e);
                setStatus(null);
            }
        };
        initializeServices();
    }, []);

    useEffect(() => {
        document.body.className = `bg-background ${theme}`;
    }, [theme]);
    
    // Effect to load Pyodide
    useEffect(() => {
        const loadPyodide = async () => {
            console.log("Loading Pyodide runtime...");
            // Safety check for race condition where script hasn't loaded yet
            if (typeof (window as any).loadPyodide !== 'function') {
                 console.warn("Pyodide script not loaded yet. Waiting...");
                 await new Promise(resolve => setTimeout(resolve, 1000));
                 if (typeof (window as any).loadPyodide !== 'function') {
                     console.error("Pyodide loadPyodide still not found after wait.");
                     return;
                 }
            }

            try {
                const pyodide = await (window as any).loadPyodide();
                console.log("Pyodide runtime loaded successfully.");
                useAppStore.setState({ pyodide, isPyodideReady: true });
            } catch (error) {
                console.error("Failed to load Pyodide:", error);
                useAppStore.setState({ isPyodideReady: false });
            }
        };
        loadPyodide();
    }, []);

    return (
        <div className={theme}>
            {children}
        </div>
    );
};

// The hook components will use to access the store
export const useAppContext = useAppStore;
