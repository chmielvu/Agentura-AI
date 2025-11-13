
import React, { useReducer, useCallback, useMemo, useEffect, useRef, useState } from 'react'; 
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall, CritiqueResult, GroundingSource, AgenticState, WorkflowState, WorkflowStepState, SwarmMode, VizSpec, RagSource, ReflexionEntry } from '../../types';
import { APP_VERSION, AGENT_ROSTER, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL, SOTA_SECURITY_PIPELINE, CRITIQUE_TOOL } from '../../constants'; // SOTA: Import SOTA_SECURITY_PIPELINE, CRITIQUE_TOOL
import { extractSources, fileToGenerativePart } from './helpers';
import { agentGraphConfigs } from '../components/graphConfigs';
import { useDB } from './useDB';
import { useEmbeddingService } from './useEmbeddingService';

interface OrchestratorState {
    version: string;
    messages: ChatMessage[];
    agenticState: AgenticState;
    isLoading: boolean;
}

type Action =
    | { type: 'RESTORE_STATE'; payload: OrchestratorState }
    | { type: 'SET_MESSAGES'; payload: ChatMessage[] }
    | { type: 'SEND_MESSAGE_START'; payload: { userMessage: ChatMessage } }
    | { type: 'ADD_ASSISTANT_MESSAGE'; payload: { assistantMessage: ChatMessage } }
    | { type: 'UPDATE_ASSISTANT_MESSAGE'; payload: { messageId: string; update: Partial<ChatMessage> } }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'UPDATE_WORKFLOW_STATE'; payload: { messageId: string; nodeId: number; state: Partial<WorkflowStepState> } }
    | { type: 'UPDATE_PLAN_STEP'; payload: { planId: string; stepId: number; status: PlanStep['status']; result?: string } }
    | { type: 'SET_AGENTIC_STATE'; payload: Partial<AgenticState> };


const initialState: OrchestratorState = {
    version: APP_VERSION,
    messages: [],
    agenticState: {},
    isLoading: false,
};

const parseCodeFromXML = (xmlString: string): { code: string, error: string | null } => {
    try {
        const contentMatch = xmlString.match(/<content>([\s\S]*?)<\/content>/);
        if (!contentMatch || !contentMatch[1]) {
            if (!xmlString.trim().startsWith('<')) return { code: xmlString, error: null };
            throw new Error("No <content> tag found.");
        }
        let content = contentMatch[1].trim();
        if (content.startsWith("<![CDATA[") && content.endsWith("]]>")) {
            content = content.substring(9, content.length - 3).trim();
            return { code: content, error: null };
        }
        content = content.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        return { code: content, error: null };
    } catch (e) {
        const error = e as Error;
        return { code: "", error: `[ERROR: Code agent did not return valid XML/CDATA: ${error.message}]` };
    }
};

// SOTA: This function is brittle and a major failure point.
// We are refactoring to remove reliance on it where possible.
const safeJsonParse = (jsonString: string): { data: any, error: string | null } => {
    try {
        const jsonMatch = jsonString.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (!jsonMatch) throw new Error("No JSON object or array found in the string.");
        return { data: JSON.parse(jsonMatch[0]), error: null };
    } catch (e) {
        const error = e as Error;
        return { data: null, error: `JSON parsing failed: ${error.message}. Raw output:\n\n${jsonString}`};
    }
};

const orchestratorReducer = (state: OrchestratorState, action: Action): OrchestratorState => {
    switch (action.type) {
        case 'RESTORE_STATE':
            return action.payload;
        case 'SET_MESSAGES':
            return { ...state, messages: action.payload, agenticState: {} };
        case 'SEND_MESSAGE_START':
            return { ...state, isLoading: true, messages: [...state.messages, action.payload.userMessage] };
        case 'ADD_ASSISTANT_MESSAGE':
            return { ...state, messages: [...state.messages, action.payload.assistantMessage] };
        case 'UPDATE_ASSISTANT_MESSAGE':
            return { ...state, messages: state.messages.map(msg => msg.id === action.payload.messageId ? { ...msg, ...action.payload.update } : msg) };
        case 'SET_LOADING':
            return { ...state, isLoading: action.payload };
        case 'UPDATE_WORKFLOW_STATE': { 
            const { messageId, nodeId, state: stateUpdate } = action.payload;
            return {
                ...state,
                messages: state.messages.map(msg => {
                    if (msg.id === messageId && msg.workflowState) {
                        const nodeKey = `node-${nodeId}`;
                        const existingState = msg.workflowState[nodeKey];
                        if (!existingState) return msg;
                        const updatedState: WorkflowStepState = { ...existingState, ...stateUpdate };
                        if (stateUpdate.status && existingState.status !== stateUpdate.status) {
                            if (stateUpdate.status === 'running') updatedState.startTime = Date.now();
                            if (['completed', 'failed'].includes(stateUpdate.status)) updatedState.endTime = Date.now();
                        }
                        return { ...msg, workflowState: { ...msg.workflowState, [nodeKey]: updatedState } };
                    }
                    return msg;
                }),
            };
        }
        case 'UPDATE_PLAN_STEP': {
            const { planId, stepId, status, result } = action.payload;
            return {
                ...state,
                messages: state.messages.map(msg => {
                    if (msg.plan?.id === planId) {
                        const newPlan = {
                            ...msg.plan,
                            plan: msg.plan.plan.map(step => {
                                if (step.step_id === stepId) {
                                    const newStep = { ...step, status, ...(result !== undefined && { result }) };
                                    if (status === 'in-progress' && !step.startTime) {
                                        newStep.startTime = Date.now();
                                    }
                                    if ((status === 'completed' || status === 'failed') && !step.endTime) {
                                        newStep.endTime = Date.now();
                                    }
                                    return newStep;
                                }
                                return step;
                            })
                        };
                        return { ...msg, plan: newPlan };
                    }
                    return msg;
                }),
            };
        }
        case 'SET_AGENTIC_STATE':
            return { ...state, agenticState: { ...state.agenticState, ...action.payload } };
        default:
            return state;
    }
};

const parseApiErrorMessage = (e: any): string => {
    if (e?.message) {
        if (e.message.includes('401') || e.message.includes('403') || e.message.includes('API key not valid')) return "Authentication Error. Please ensure your API Key is valid.";
        if (e.message.includes('429')) return "API quota exceeded. Please wait and try again later.";
        if (e.message.includes('SAFETY')) return "The response was blocked by the safety filter due to potential policy violations.";
        return `Error: ${e.message}`;
    }
    return "An unknown error occurred.";
};

export const useModularOrchestrator = (
    persona: Persona,
    swarmMode: SwarmMode,
    activeRoster: TaskType[],
    pyodideRef: React.MutableRefObject<any>
) => {
    const [state, dispatch] = useReducer(orchestratorReducer, initialState);
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY as string }), []);
    const [sessionFeedback, setSessionFeedback] = useState<Record<string, string[]>>({});
    const { findSimilar, addReflexionEntry, findSimilarReflexions } = useDB();
    const { generateEmbedding } = useEmbeddingService();

    const addSessionFeedback = useCallback((taskType: TaskType, feedback: string) => {
        setSessionFeedback(prev => ({ ...prev, [taskType]: [...(prev[taskType] || []), feedback] }));
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('agentic-session');
            if (saved) {
                const parsed = JSON.parse(saved) as OrchestratorState;
                if (parsed.version === APP_VERSION) dispatch({ type: 'RESTORE_STATE', payload: parsed });
                else localStorage.removeItem('agentic-session');
            }
        } catch (e) { localStorage.removeItem('agentic-session'); }
    }, []);

    useEffect(() => {
        try { localStorage.setItem('agentic-session', JSON.stringify(state)); }
        catch (e) { console.error("Failed to save state", e); }
    }, [state]);

    const updateWorkflowState = useCallback((messageId: string, nodeId: number, update: Partial<WorkflowStepState>) => {
        dispatch({ type: 'UPDATE_WORKFLOW_STATE', payload: { messageId, nodeId, state: update } });
    }, [dispatch]);

    const handleApiError = useCallback((e: any, assistantMessageId: string, manageLoadingState: boolean) => {
        const errorMessage = parseApiErrorMessage(e);
        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false, content: errorMessage } } });
        if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
        throw e;
    }, [dispatch]);

    const runPythonCode = async (code: string): Promise<{ success: boolean; output: string; error?: string }> => {
        if (!pyodideRef.current) return { success: false, output: "", error: "Pyodide is not initialized." };
        try {
            pyodideRef.current.runPython(`import sys, io; sys.stdout = io.StringIO()`);
            const result = await pyodideRef.current.runPythonAsync(code);
            const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
            return { success: true, output: stdout || result?.toString() || "Code executed without output." };
        } catch (e) {
            return { success: false, output: "", error: (e as Error).message };
        }
    };
    
    const getChat = (taskType: TaskType, history: ChatMessage[] = []): Chat => {
        const agentConfig = AGENT_ROSTER[taskType];
        const personaInstruction = PERSONA_CONFIGS[persona].instruction;
        let systemInstruction = [personaInstruction, agentConfig.systemInstruction].filter(Boolean).join('\n\n');
        const feedbackForAgent = sessionFeedback[taskType];
        if (feedbackForAgent?.length > 0) {
            const feedbackHeader = "\n\n--- CRITICAL USER FEEDBACK (MUST FOLLOW) ---";
            const feedbackList = feedbackForAgent.map((f, i) => `${i+1}. ${f}`).join('\n');
            systemInstruction = [systemInstruction, feedbackHeader, feedbackList].join('\n');
        }
        return ai.chats.create({
            model: agentConfig.model,
            // SOTA: Pass tools to config
            config: { ...agentConfig.config, tools: agentConfig.tools, ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }) },
            history: history.map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{text: m.content}] }))
        });
    };

    const processStream = useCallback(async (stream: AsyncGenerator<GenerateContentResponse>, assistantMessageId: string, onStreamUpdate?: (streamedText: string) => void) => {
        let fullText = '', sources: GroundingSource[] = [], functionCalls: FunctionCall[] = [];
        for await (const chunk of stream) {
          if (chunk.text) fullText += chunk.text;
          if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls.map(fc => ({ id: `fc-${Date.now()}`, name: fc.name, args: fc.args })));
          const newSources = extractSources(chunk);
          sources = Array.from(new Map([...sources, ...newSources].map(s => [s.uri, s])).values());
          if (onStreamUpdate) onStreamUpdate(fullText);
          dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { content: fullText, sources, functionCalls } } });
        }
        return { fullText, sources, functionCalls };
    }, [dispatch]);
    
    const runRerankPipeline = async (prompt: string, assistantMsgId: string) => {
        try {
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "Retrieving relevant documents from archive...", taskType: TaskType.ManualRAG } } });
            const queryVector = await generateEmbedding(prompt);
            const similarChunks = await findSimilar(queryVector, 10); 
            if (similarChunks.length === 0) {
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "I couldn't find any relevant documents in your archive for this query.", isLoading: false} } });
                return;
            }
            let ragSources: RagSource[] = similarChunks.map(c => ({ documentName: c.source, chunkContent: c.text, similarityScore: c.similarity }));
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { ragSources } } });

            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "Reranking retrieved documents for relevance...", taskType: TaskType.Reranker } } });
            const rerankerPrompt = AGENT_ROSTER[TaskType.Reranker].systemInstruction.replace('{query}', prompt).replace('{chunks_json}', JSON.stringify(ragSources.map(r => ({ documentName: r.documentName, chunkContent: r.chunkContent }))));
            const rerankMsg = await handleSendMessageInternal(rerankerPrompt, undefined, undefined, TaskType.Reranker, true, false);
            
            const { data: parsed, error } = safeJsonParse(rerankMsg.content); // SOTA: Reranker still uses brittle JSON, this is a candidate for tool use refactor.
            if (error || !parsed.reranked_chunks) {
                console.error("Reranker failed to return valid JSON:", error || "Missing 'reranked_chunks' key.");
                ragSources = ragSources.slice(0, 5); // Fallback to vector search
            } else {
                ragSources = parsed.reranked_chunks
                    .map((c: any) => ({ documentName: c.documentName, chunkContent: c.chunkContent, rerankScore: c.rerankScore }))
                    .sort((a: RagSource, b: RagSource) => (b.rerankScore || 0) - (a.rerankScore || 0))
                    .slice(0, 5);
            }
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { ragSources } } });

            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "Synthesizing answer from reranked documents...", taskType: TaskType.Chat} } });
            let ragContext = "--- RELEVANT CONTEXT FROM YOUR ARCHIVE (Reranked) ---\n" + ragSources.map(c => `[Source: ${c.documentName} (Score: ${c.rerankScore?.toFixed(2) || 'N/A'})]\n${c.chunkContent}\n`).join('---\n');
            const finalPrompt = `${ragContext}\n\nUser Query: ${prompt}`;
            const synthMsg = await handleSendMessageInternal(finalPrompt, undefined, undefined, TaskType.Chat, true, false);
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: synthMsg.content, isLoading: false } } });

        } catch (e) { handleApiError(e, assistantMsgId, true); }
    };

    const handleSendMessageInternal = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isPlanStep: boolean = false, manageLoadingState: boolean = true, onStreamUpdate?: (streamedText: string) => void): Promise<ChatMessage> => {
        return new Promise(async (resolve, reject) => {
            const assistantMsgId = isPlanStep ? `step-${Date.now()}-${Math.random()}` : Date.now().toString();
            let routedTask = forcedTask;
            
            try {
                if (!routedTask) {
                    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, workflowState: { 'node-1': { status: 'running', startTime: Date.now(), details: 'Routing user query...' } } };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
                    const routerHistory = state.messages.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: m.content }] }));
                    // SOTA: Router is one of the few places that correctly uses tools already.
                    const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                    const proposedRoute = routerResp.functionCalls?.[0]?.args.route as TaskType | undefined;
                    routedTask = proposedRoute && AGENT_ROSTER.hasOwnProperty(proposedRoute) ? proposedRoute : TaskType.Chat;
                } else if (!isPlanStep) {
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: routedTask } } });
                } else if (isPlanStep && routedTask !== TaskType.Verifier) {
                     // Don't add a message for verifier calls, they are silent background tasks.
                }

                if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
                if (routedTask === TaskType.ManualRAG && !isPlanStep) {
                    await runRerankPipeline(prompt, assistantMsgId);
                    const finalMessage = state.messages.find(m => m.id === assistantMsgId) || state.messages[state.messages.length - 1];
                    resolve(finalMessage); 
                    return;
                }

                const agentConfig = AGENT_ROSTER[routedTask!];
                const graphConfig = agentGraphConfigs[routedTask!];
                const workflowState: WorkflowState = {};
                if (graphConfig) graphConfig.nodes.forEach(node => { workflowState[`node-${node.id}`] = { status: 'pending' }; });
                if(workflowState['node-1'] && !isPlanStep) {
                    workflowState['node-1'] = { status: 'completed', endTime: Date.now(), details: { routed_to: routedTask } };
                    workflowState['node-2'] = { status: 'running', startTime: Date.now() };
                }
                if(!isPlanStep) dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { taskType: routedTask, workflowState } } });
                
                const chat = getChat(routedTask!, state.messages);
                const parts: Part[] = [{ text: prompt }];
                if (file) parts.push(fileToGenerativePart(file));
                const stream = await chat.sendMessageStream({ message: { role: 'user', parts } });
                const streamOutput = await processStream(stream, assistantMsgId, onStreamUpdate);
                
                if (workflowState['node-2'] && !isPlanStep) updateWorkflowState(assistantMsgId, 2, { status: 'completed', details: { output: streamOutput.fullText.substring(0, 200) + '...' } });
                
                let vizSpec: VizSpec | undefined = undefined;
                // SOTA: Refactor DataAnalyst to use function calls
                if (routedTask === TaskType.DataAnalyst) {
                    const vizCall = streamOutput.functionCalls.find(fc => fc.name === 'submit_visualization_spec');
                    if (!vizCall) {
                        streamOutput.fullText = `[DataAnalyst Error: Failed to generate valid VizSpec. The agent did not call the 'submit_visualization_spec' tool.]\n\n${streamOutput.fullText}`;
                    } else {
                        vizSpec = vizCall.args as VizSpec;
                        streamOutput.fullText = "Here is the data visualization you requested:";
                    }
                }

                const finalMessage: ChatMessage = { id: assistantMsgId, role: 'assistant', content: streamOutput.fullText, isLoading: false, sources: streamOutput.sources, functionCalls: streamOutput.functionCalls, ragSources: [], vizSpec, taskType: routedTask };
                if (!isPlanStep) { // Only update final message if not a plan step
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: finalMessage } });
                }
                resolve(finalMessage);

            } catch(e) { handleApiError(e, assistantMsgId, manageLoadingState); reject(e); }
        });
    }, [state.messages, ai, persona, processStream, dispatch, handleApiError, getChat, sessionFeedback, findSimilar, generateEmbedding, updateWorkflowState, runRerankPipeline]);

    const runRoundTableDebate = async (prompt: string, file: FileData | undefined, repoUrl: string | undefined, initialAssistantMsgId: string) => {
        let draftContent = prompt, researchContent = "No research conducted.", critiqueContent = "No critique generated.";
        const debateHistory: string[] = [`User Request: ${prompt}`];
        const NUM_CYCLES = 2;

        try {
            for (let i = 0; i < NUM_CYCLES; i++) {
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: `**Cycle ${i + 1}/${NUM_CYCLES}:** Refining draft...`, taskType: TaskType.Creative} } });
                const creativePrompt = i === 0 ? `You are a Creative agent. Create a detailed draft for the following user request: ${prompt}` : `You are a Creative agent. Refine your draft based on the critique.\n[Original Request]: ${prompt}\n[Previous Draft]: ${draftContent}\n[Fact-Check]: ${researchContent}\n[Critique]: ${critiqueContent}`;
                const creativeMsg = await handleSendMessageInternal(creativePrompt, i === 0 ? file : undefined, repoUrl, TaskType.Creative, true);
                draftContent = creativeMsg.content;
                debateHistory.push(`Cycle ${i+1} Draft: ${draftContent}`);
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: `**Cycle ${i + 1}/${NUM_CYCLES}:** (Draft Updated)\n\n${draftContent.substring(0, 500)}...`} } });

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: `**Cycle ${i + 1}/${NUM_CYCLES}:** Fact-checking draft...`, taskType: TaskType.Research} } });
                const researchPrompt = `You are a fact-checker. Analyze the following draft. Identify any claims that need verification and check them using Google Search.\n[Draft]: ${draftContent}`;
                const researchMsg = await handleSendMessageInternal(researchPrompt, undefined, undefined, TaskType.Research, true);
                researchContent = researchMsg.content;
                debateHistory.push(`Cycle ${i+1} Fact-Check: ${researchContent}`);

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: `**Cycle ${i + 1}/${NUM_CYCLES}:** Critiquing draft...`, taskType: TaskType.Critique} } });
                const critiquePrompt = `You are a Critic. Critique the [Draft] based on the [Original Request] and the [Fact-Check].\n[Original Request]: ${prompt}\n[Draft]: ${draftContent}\n[Fact-Check]: ${researchContent}`;
                const critiqueMsg = await handleSendMessageInternal(critiquePrompt, undefined, undefined, TaskType.Critique, true);
                
                // SOTA: Refactor to read from function call
                const critiqueCall = critiqueMsg.functionCalls?.find(fc => fc.name === CRITIQUE_TOOL.name);
                if (!critiqueCall) {
                    console.error("Critique parsing failed, agent did not call tool.");
                    critiqueContent = critiqueMsg.content || "Critique failed.";
                } else {
                    critiqueContent = critiqueCall.args.critique;
                }
                debateHistory.push(`Cycle ${i+1} Critique: ${critiqueContent}`);
            }

            const finalPrompt = `You are a Synthesizer agent. Combine the "Round Table" debate history into a single, high-quality, final answer for the user.\n[Debate History]:\n${debateHistory.join('\n\n---\n\n')}\n\n[Final Task]: Synthesize the final draft into a clean, complete response.`;
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: `**Final Synthesis:** Synthesizing final answer...`, taskType: TaskType.Chat} } });
            const finalMsg = await handleSendMessageInternal(finalPrompt, undefined, undefined, TaskType.Chat, true);
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: finalMsg.content, isLoading: false } } });

        } catch (e) { handleApiError(e, initialAssistantMsgId, true); }
    };

    const initiateSelfCorrection = useCallback(async (plan: Plan, fullPlanTrace: any[]): Promise<Plan> => {
        const failedStep = plan.plan.find(p => p.status === 'failed');
        if (!failedStep) throw new Error("Self-correction called without a failed step.");
    
        fullPlanTrace.push({ event: 'self_correction_initiated', step: failedStep.step_id, reason: failedStep.result });
    
        const apoPrompt = `[Prompt]: ${failedStep.description}\n[Failed Output]: ${failedStep.result || 'No output.'}\n[Critique]: This plan step failed.`;
        // SOTA: The Retry agent correctly uses a tool (APO_REFINE_TOOL), so this call is already robust.
        const retryMessage = await handleSendMessageInternal(apoPrompt, undefined, undefined, TaskType.Retry, true, false);
        const newPlannerGoal = retryMessage.content;
        fullPlanTrace.push({ event: 'apo_success', new_goal: newPlannerGoal });
    
        try {
            const promptEmbedding = await generateEmbedding(failedStep.description);
            await addReflexionEntry({ promptEmbedding, original_prompt: failedStep.description, failed_output: failedStep.result || 'No output.', critique: `Failed with error: ${failedStep.result}`, successful_fix: newPlannerGoal });
        } catch (e) { console.error("Failed to save reflexion memory:", e); }
    
        const newPlanMessage = await handleSendMessageInternal(newPlannerGoal, undefined, undefined, TaskType.Planner, false, false);
    
        // SOTA: Refactor to read from function call
        const planCall = newPlanMessage.functionCalls?.find(fc => fc.name === 'submit_plan');
        if (!planCall || !planCall.args.plan) {
            throw new Error(`Self-correction failed: Planner (Retry) did not return a valid 'submit_plan' tool call.`);
        }
        const planJson = planCall.args;
        
        const parsedPlan: Plan = { id: `plan-${newPlanMessage.id}`, plan: planJson.plan.map((step: any) => ({ ...step, status: 'pending' })) };
        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: newPlanMessage.id, update: { plan: parsedPlan, content: '' } } });
        fullPlanTrace.push({ event: 'new_plan_generated', plan: parsedPlan });
        return parsedPlan;

    }, [handleSendMessageInternal, dispatch, generateEmbedding, addReflexionEntry]);

    const handleExecutePlan = useCallback(async (plan: Plan, fullPlanTrace: any[]): Promise<string> => {
        if (plan.plan.some(p => p.status === 'failed')) {
            try {
                dispatch({ type: 'SET_LOADING', payload: true });
                const newPlan = await initiateSelfCorrection(plan, fullPlanTrace);
                return await handleExecutePlan(newPlan, fullPlanTrace);
            } catch (e) {
                const errorResult = `Self-Correction Error: ${(e as Error).message}`;
                fullPlanTrace.push({ event: 'retry_failed', details: errorResult });
                return errorResult;
            } finally { dispatch({ type: 'SET_LOADING', payload: false }); }
        }

        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: plan.id } });
    
        let pendingSteps = plan.plan.filter(step => step.status === 'pending');
        
        try {
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: plan.id, update: { content: "Validating plan..." } } });
            pendingSteps.forEach(step => dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress', result: 'Validating...' } }));
            
            // SOTA: Verifier also uses brittle JSON. This is another candidate for tool use refactor, but we leave it for now.
            const validationPrompt = AGENT_ROSTER[TaskType.Verifier].systemInstruction.replace('{plan_steps_json_array}', JSON.stringify(pendingSteps));
            const validationMsg = await handleSendMessageInternal(validationPrompt, undefined, undefined, TaskType.Verifier, true, false);
            
            const { data: parsed, error } = safeJsonParse(validationMsg.content);
            if (error || !parsed.results) throw new Error(`Plan validation failed: Verifier agent returned invalid JSON. ${error}`);
            
            let failedValidations = 0;
            parsed.results.forEach((res: { step_id: number; status: "PASS" | "FAIL"; reason: string; }) => {
                if (res.status === 'FAIL') {
                    failedValidations++;
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: res.step_id, status: 'failed', result: `Validation FAILED: ${res.reason}` } });
                } else {
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: res.step_id, status: 'pending', result: 'Validated.' } });
                }
            });

            if(failedValidations > 0) throw new Error(`Plan validation failed on ${failedValidations} step(s). See step results for details.`);

            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: plan.id, update: { content: "Plan validated. Executing..." } } });
        } catch (e: any) {
            fullPlanTrace.push({ event: 'plan_failed_validation', details: e.message });
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: plan.id, update: { content: `Plan FAILED validation: ${e.message}` } } });
            dispatch({ type: 'SET_LOADING', payload: false });
            return e.message;
        }

        const planState: Record<string, any> = {};
        pendingSteps = plan.plan.filter(step => step.status === 'pending');
        
        while (pendingSteps.length > 0) {
            const executableSteps = pendingSteps.filter(step => !step.inputs || step.inputs.every(inputKey => planState.hasOwnProperty(inputKey)));
    
            if (executableSteps.length === 0) {
                const errorResult = "Plan stalled due to missing dependencies.";
                fullPlanTrace.push({ event: 'plan_failed', details: errorResult });
                dispatch({ type: 'SET_LOADING', payload: false });
                return errorResult;
            }
    
            const stepPromises = executableSteps.map(async (step) => {
                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress', result: 'Executing...' } });
                const toolName = step.tool_to_use as TaskType;
                if (!AGENT_ROSTER.hasOwnProperty(toolName)) throw new Error(`Plan referenced an unknown agent: '${toolName}'.`);
                
                let stepDescription = step.description;
                if (step.inputs) {
                    for (const key of step.inputs) {
                        const inputData = planState[key] || '';
                        stepDescription = stepDescription.replace(new RegExp(`\\{${key}\\}`, 'g'), typeof inputData === 'string' ? inputData : JSON.stringify(inputData));
                    }
                }
                const resultMessage = await handleSendMessageInternal(stepDescription, undefined, undefined, toolName, true, false, (streamedText) => {
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress', result: streamedText + ' |'} });
                });
                return { step, resultMessage };
            });
    
            const results = await Promise.allSettled(stepPromises);
            let aStepFailedInThisBatch = false;

            for (const result of results) {
                const failedStepIndex = results.indexOf(result);
                const stepThatRan = executableSteps[failedStepIndex];

                if (result.status === 'fulfilled') {
                    const { step, resultMessage } = result.value;
                    let outputData = resultMessage.content;
                    
                    if (step.tool_to_use === TaskType.Code) {
                        const { code, error } = parseCodeFromXML(outputData); // Code agent uses robust XML
                        if (error) { throw new Error(error); } 
                        const codeResult = await runPythonCode(code);
                        outputData = codeResult.success ? codeResult.output : `Execution Failed: ${codeResult.error}`;
                        if (!codeResult.success) { throw new Error(outputData); }
                    }
                    
                    // SOTA: Check for DataAnalyst tool call
                    if (step.tool_to_use === TaskType.DataAnalyst) {
                        const vizCall = resultMessage.functionCalls?.find(fc => fc.name === 'submit_visualization_spec');
                        if (!vizCall) { throw new Error("DataAnalyst agent failed to call 'submit_visualization_spec' tool."); }
                        // Don't set outputData, the vizSpec is attached to the *message*
                        // But we need to update the *plan step* with the vizSpec for the UI
                        dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: JSON.stringify(vizCall.args, null, 2) } });
                        // We also need to attach it to the *main* message
                        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: plan.id, update: { vizSpec: vizCall.args as VizSpec } } });
                        outputData = "Visualization Spec Generated."; // Set placeholder for plan state
                    }

                    const agenticRagCall = resultMessage.functionCalls?.find(fc => fc.name === 'autonomous_rag_tool');
                    if (agenticRagCall) {
                        const queryVector = await generateEmbedding(agenticRagCall.args.query);
                        const similarChunks = await findSimilar(queryVector, 5);
                        outputData = JSON.stringify(similarChunks.map(c => ({ documentName: c.source, chunkContent: c.text, similarityScore: c.similarity })));
                    }

                    if (step.output_key) planState[step.output_key] = outputData;
                    if (step.tool_to_use !== TaskType.DataAnalyst) { // DataAnalyst already set its step
                        dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: outputData } });
                    }
                    fullPlanTrace.push({ event: 'step_completed', step: step.step_id, result: outputData });
                } else {
                    aStepFailedInThisBatch = true;
                    const errorReason = result.reason as any;
                    const errorResult = `Step ${stepThatRan.step_id} (${stepThatRan.tool_to_use}) failed: ${errorReason.message || parseApiErrorMessage(result.reason)}`;
                    fullPlanTrace.push({ event: 'step_failed', step: stepThatRan.step_id, details: errorResult });
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: stepThatRan.step_id, status: 'failed', result: errorResult } });
                }
            }
            
            if (aStepFailedInThisBatch) {
                const errorResult = "Plan execution failed at one or more steps. Please review the results and retry.";
                fullPlanTrace.push({ event: 'plan_failed_execution', details: "One or more steps failed." });
                dispatch({ type: 'SET_LOADING', payload: false });
                return errorResult;
            }
            
            const executedStepIds = executableSteps.map(s => s.step_id);
            pendingSteps = pendingSteps.filter(s => !executedStepIds.includes(s.step_id));
        }
        
        const finalResult = Object.values(planState).pop() || "Plan executed successfully.";
        fullPlanTrace.push({ event: 'plan_success', result: finalResult });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: undefined } });
        dispatch({ type: 'SET_LOADING', payload: false });
        return finalResult;
    }, [handleSendMessageInternal, dispatch, runPythonCode, generateEmbedding, findSimilar, initiateSelfCorrection]);
    

    // SOTA: New function to implement Opportunity 1
    const runSecurityServicePipeline = async (prompt: string, file: FileData | undefined, repoUrl: string | undefined, initialAssistantMsgId: string) => {
        let supervisorReport = `**Supervisor Report (Security Service)**\nTrace for goal: "${prompt}"\n\n`;
        let finalOutput = "Pipeline execution failed.";
        let executionState: Record<string, any> = { user_prompt: prompt };
        
        try {
            dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: {id: initialAssistantMsgId, role: 'assistant', content: "Initializing Security Service Pipeline...", isLoading: true, taskType: TaskType.Planner} } });

            for (const step of SOTA_SECURITY_PIPELINE.steps) {
                const stepPrompt = step.task.replace('{{user_prompt}}', prompt).replace('{{final_output}}', finalOutput);

                if (step.agent === 'Supervisor') {
                    if (step.task === 'execute_plan') {
                        supervisorReport += "SUPERVISOR: Executing generated plan.\n";
                        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: supervisorReport } } });
                        
                        const plan = executionState.plan as Plan; // Get plan from previous step
                        if (!plan) throw new Error("Supervisor error: No plan found in state to execute.");
                        
                        // Use the existing robust plan executor
                        const planResult = await handleExecutePlan(plan, []); 
                        finalOutput = planResult;
                        executionState.final_output = finalOutput;
                        supervisorReport += `SUPERVISOR: Plan execution finished. Result: ${finalOutput.substring(0, 100)}...\n`;
                    }
                    if (step.task === 'generate_supervisor_report') {
                         executionState.supervisorReport = supervisorReport + "\nSUPERVISOR: Pipeline complete.";
                    }
                } else {
                    // This is an Agent step
                    supervisorReport += `SUPERVISOR: Calling ${step.agent} with task: "${stepPrompt.substring(0, 50)}..."\n`;
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { content: supervisorReport, taskType: step.agent } } });
                    
                    const agentResponse = await handleSendMessageInternal(stepPrompt, file, repoUrl, step.agent, true, false);

                    if (step.agent === TaskType.Planner) {
                        const planCall = agentResponse.functionCalls?.find(fc => fc.name === 'submit_plan');
                        if (!planCall || !planCall.args.plan) throw new Error("Planner failed to return a 'submit_plan' tool call.");
                        const parsedPlan: Plan = { id: `plan-${initialAssistantMsgId}`, plan: planCall.args.plan.map((s: any) => ({ ...s, status: 'pending' })) };
                        executionState.plan = parsedPlan;
                        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: initialAssistantMsgId, update: { plan: parsedPlan } } });
                        supervisorReport += `SUPERVISOR: ${step.agent} returned a plan with ${parsedPlan.plan.length} steps.\n`;
                    }
                    if (step.agent === TaskType.Critique) {
                        const critiqueCall = agentResponse.functionCalls?.find(fc => fc.name === CRITIQUE_TOOL.name);
                        if (!critiqueCall) throw new Error("Critique agent failed to return a 'submit_critique' tool call.");
                        executionState.critique = critiqueCall.args;
                        supervisorReport += `SUPERVISOR: ${step.agent} returned critique. Score: ${critiqueCall.args.scores.coherence}/5.\n`;
                    }
                }
            }
            
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { 
                messageId: initialAssistantMsgId, 
                update: { 
                    content: finalOutput, 
                    supervisorReport: executionState.supervisorReport, 
                    isLoading: false 
                } 
            }});

        } catch (e) {
             const errorMsg = parseApiErrorMessage(e);
             supervisorReport += `\nSUPERVISOR: Pipeline FAILED. Error: ${errorMsg}`;
             dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { 
                 messageId: initialAssistantMsgId, 
                 content: `Pipeline Failed: ${errorMsg}`, 
                 supervisorReport: supervisorReport, 
                 isLoading: false 
            }});
        }
    };

    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => {
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file };
        dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: userMsg } });
        
        const fullPlanTrace: any[] = [{ event: 'start', user_prompt: prompt, swarm_mode: swarmMode }];
        const finalAssistantMsgId = (parseInt(userMsg.id) + 1).toString();
        
        try {
            if (swarmMode === SwarmMode.TheRoundTable) {
                const assistantMsg: ChatMessage = { id: finalAssistantMsgId, role: 'assistant', content: 'Starting "The Round Table" debate...', isLoading: true, taskType: TaskType.Creative };
                dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
                await runRoundTableDebate(prompt, file, repoUrl, finalAssistantMsgId);
                return;
            }

            if (swarmMode === SwarmMode.InformalCollaborators) {
                 if (file && (file.type === 'text/csv' || file.type === 'application/json' || file.type === 'text/plain')) {
                    await handleSendMessageInternal(prompt, file, repoUrl, TaskType.DataAnalyst);
                    return;
                }
                
                if (forcedTask) {
                    await handleSendMessageInternal(prompt, file, repoUrl, forcedTask);
                    return;
                }
                
                let lessonText = "No past lessons found for this task.";
                try {
                    const queryEmbedding = await generateEmbedding(prompt);
                    const lessons = await findSimilarReflexions(queryEmbedding);
                    if (lessons.length > 0) {
                         lessonText = "Review these past lessons before you begin:\n" + lessons.map((l, i) => `[PAST LESSON ${i+1}]:\n- ORIGINAL GOAL: ${l.original_prompt}\n- FAILURE: ${l.critique}\n- SUCCESSFUL FIX: ${l.successful_fix}\n`).join('\n\n');
                    }
                } catch (e) { console.error("Failed to find similar reflexions:", e); }

                const agentList = activeRoster.filter(t => !INTERNAL_AGENTS.includes(t)).join(', ');
                const plannerPrompt = AGENT_ROSTER[TaskType.Planner].systemInstruction.replace('{past_lessons}', lessonText).replace('{goal}', prompt).replace('{agents}', agentList);

                fullPlanTrace.push({ event: 'invoke_planner', prompt: plannerPrompt });
                const planMessage = await handleSendMessageInternal(plannerPrompt, file, repoUrl, TaskType.Planner, false, false);
                
                // SOTA: Refactor to read from function call
                const planCall = planMessage.functionCalls?.find(fc => fc.name === 'submit_plan');
                if (!planCall || !planCall.args.plan) {
                     dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: planMessage.id, update: { content: `I was unable to generate a valid plan (Agent did not call 'submit_plan' tool).`, isLoading: false } } });
                     return;
                }
                const planJson = planCall.args;
                
                const parsedPlan: Plan = { id: `plan-${planMessage.id}`, plan: planJson.plan.map((step: any) => ({ ...step, status: 'pending' })) };
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: planMessage.id, update: { plan: parsedPlan, content: '' } } });
                fullPlanTrace.push({ event: 'plan_received', plan: parsedPlan });
                const finalResult = await handleExecutePlan(parsedPlan, fullPlanTrace);
                
                const reportPrompt = `You are a Swarm Evaluator. Here is the full execution trace of a multi-agent swarm. Provide a 'Supervisor's Report' evaluating the swarm's efficiency and logic.\n\nTRACE:\n${JSON.stringify(fullPlanTrace, null, 2)}`;
                // SOTA: This should also be a tool call
                const reportMsg = await handleSendMessageInternal(reportPrompt, undefined, undefined, TaskType.Critique, true, false);
                const critiqueCall = reportMsg.functionCalls?.find(fc => fc.name === CRITIQUE_TOOL.name);
                const reportContent = critiqueCall ? critiqueCall.args.critique : "Supervisor report generation failed.";

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: planMessage.id, update: { content: finalResult, supervisorReport: reportContent, isLoading: false } } });
            } else { // SOTA: Security Service - Implement Opportunity 1
                 await runSecurityServicePipeline(prompt, file, repoUrl, finalAssistantMsgId);
            }
        } catch (e) {
            const errorMsg = parseApiErrorMessage(e);
             dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: {id: finalAssistantMsgId, role: 'assistant', content: `Swarm execution failed: ${errorMsg}`, isLoading: false} } });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [swarmMode, activeRoster, handleSendMessageInternal, handleExecutePlan, dispatch, addReflexionEntry, findSimilarReflexions, generateEmbedding, runRoundTableDebate, runSecurityServicePipeline]); // SOTA: Add new functions to dependency array

    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string, codeOverride?: string) => {
        console.log("handleExecuteCode called (currently handled in plan execution)", messageId, functionCallId);
    }, []);

    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);
    
    const INTERNAL_AGENTS = [TaskType.Reranker, TaskType.Embedder, TaskType.Verifier, TaskType.Retry];


    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan, addSessionFeedback };
};
