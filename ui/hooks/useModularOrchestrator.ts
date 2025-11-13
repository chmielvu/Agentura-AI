
import React, { useReducer, useCallback, useMemo, useEffect, useRef, useState } from 'react'; 
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall, CritiqueResult, GroundingSource, AgenticState, WorkflowState, WorkflowStepState, SwarmMode, VizSpec, RagSource } from '../../types';
import { APP_VERSION, AGENT_ROSTER, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL } from '../../constants';
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

const orchestratorReducer = (state: OrchestratorState, action: Action): OrchestratorState => {
    switch (action.type) {
        case 'RESTORE_STATE':
            return action.payload;
        case 'SET_MESSAGES':
            return { ...state, messages: action.payload, agenticState: {} };
        case 'SEND_MESSAGE_START':
            return {
                ...state,
                isLoading: true,
                messages: [...state.messages, action.payload.userMessage],
            };
        case 'ADD_ASSISTANT_MESSAGE':
            return {
                ...state,
                messages: [...state.messages, action.payload.assistantMessage],
            };
        case 'UPDATE_ASSISTANT_MESSAGE':
            return {
                ...state,
                messages: state.messages.map(msg =>
                    msg.id === action.payload.messageId ? { ...msg, ...action.payload.update } : msg
                ),
            };
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

                        if (!existingState) {
                            return msg;
                        }

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
                                    let finalResult = result;
                                    // REFINEMENT: Remove streaming cursor when task is done
                                    if (status === 'completed' && result && result.endsWith(' |')) {
                                        finalResult = result.substring(0, result.length - 2);
                                    }
                                    return { ...step, status, ...(result !== undefined && { result: finalResult }) };
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
        if (e.message.includes('401') || e.message.includes('403') || e.message.includes('API key not valid')) {
            return "Authentication Error. Please ensure your API Key is valid.";
        } else if (e.message.includes('429')) {
            return "API quota exceeded. Please wait and try again later.";
        } else if (e.message.includes('SAFETY')) {
            return "The response was blocked by the safety filter due to potential policy violations.";
        } else {
            return `Error: ${e.message}`;
        }
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
    const { findSimilar } = useDB();
    const { generateEmbedding } = useEmbeddingService();

    const addSessionFeedback = useCallback((taskType: TaskType, feedback: string) => {
        setSessionFeedback(prev => ({
            ...prev,
            [taskType]: [...(prev[taskType] || []), feedback]
        }));
    }, []);

    useEffect(() => {
        try {
            const saved = localStorage.getItem('agentic-session');
            if (saved) {
                const parsed = JSON.parse(saved) as OrchestratorState;
                if (parsed.version === APP_VERSION) {
                    dispatch({ type: 'RESTORE_STATE', payload: parsed });
                } else {
                    localStorage.removeItem('agentic-session');
                }
            }
        } catch (e) { 
            console.error("Failed to load session", e);
            localStorage.removeItem('agentic-session');
        }
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem('agentic-session', JSON.stringify(state));
        } catch (e) { console.error("Failed to save state", e); }
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
        if (!pyodideRef.current) {
            return { success: false, output: "", error: "Pyodide is not initialized." };
        }
        try {
          pyodideRef.current.runPython(`import sys, io; sys.stdout = io.StringIO()`);
          const result = await pyodideRef.current.runPythonAsync(code);
          const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
          return { success: true, output: stdout || result?.toString() || "Code executed without output." };
        } catch (e) {
            const error = e as Error;
            return { success: false, output: "", error: error.message };
        }
    };
    
    const getChat = (taskType: TaskType, history: ChatMessage[] = []): Chat => {
        const agentConfig = AGENT_ROSTER[taskType];
        const personaInstruction = PERSONA_CONFIGS[persona].instruction;

        let systemInstruction = [personaInstruction, agentConfig.systemInstruction].filter(Boolean).join('\n\n');
        const feedbackForAgent = sessionFeedback[taskType];
    
        if (feedbackForAgent && feedbackForAgent.length > 0) {
            const feedbackHeader = "\n\n--- CRITICAL USER FEEDBACK (MUST FOLLOW) ---";
            const feedbackList = feedbackForAgent.map((f, i) => `${i+1}. ${f}`).join('\n');
            systemInstruction = [systemInstruction, feedbackHeader, feedbackList].join('\n');
        }
        
        return ai.chats.create({
            model: agentConfig.model,
            config: { ...agentConfig.config, ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }) },
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
          
          // Pass streaming text to callback *before* updating the main message
          if (onStreamUpdate) onStreamUpdate(fullText);
          
          dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { content: fullText, sources, functionCalls } } });
        }
        return { fullText, sources, functionCalls };
    }, [dispatch]);
    
    // SOTA RAG 2.0: Retrieve-Rerank-Synthesize Pipeline
    const runRerankPipeline = async (prompt: string, assistantMsgId: string) => {
        let ragSources: RagSource[] = [];
        
        try {
            // 1. RETRIEVE
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "Retrieving relevant documents from archive..."} } });
            const queryVector = await generateEmbedding(prompt);
            const similarChunks = await findSimilar(queryVector, 10); // Retrieve more chunks (e.g., 10) for reranking

            if (similarChunks.length === 0) {
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "I couldn't find any relevant documents in your archive for this query."} } });
                return; // Stop pipeline
            }

            ragSources = similarChunks.map(c => ({
                documentName: c.source,
                chunkContent: c.text,
                similarityScore: c.similarity
            }));
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { ragSources } } });

            // 2. RERANK
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "Reranking retrieved documents for relevance..."} } });
            const rerankerPrompt = AGENT_ROSTER[TaskType.Reranker].systemInstruction
                .replace('{query}', prompt)
                .replace('{chunks_json}', JSON.stringify(ragSources.map(r => ({ documentName: r.documentName, chunkContent: r.chunkContent }))));
            
            const rerankMsg = await handleSendMessageInternal(rerankerPrompt, undefined, undefined, TaskType.Reranker, true, false);
            
            let rerankedSources: RagSource[] = [];
            try {
                const jsonMatch = rerankMsg.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    if (parsed.reranked_chunks) {
                        rerankedSources = parsed.reranked_chunks
                            .map((c: any) => ({
                                documentName: c.documentName,
                                chunkContent: c.chunkContent,
                                rerankScore: c.rerankScore,
                            }))
                            .sort((a: RagSource, b: RagSource) => (b.rerankScore || 0) - (a.rerankScore || 0))
                            .slice(0, 5); // Take top 5 reranked
                    }
                }
            } catch (e) {
                console.error("Reranker failed to return valid JSON:", e);
                rerankedSources = ragSources.slice(0, 5); // Fallback to vector search
            }
            
            ragSources = rerankedSources.length > 0 ? rerankedSources : ragSources.slice(0, 5);
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { ragSources } } });

            // 3. SYNTHESIZE
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: "Synthesizing answer from reranked documents..."} } });
            let ragContext = "--- RELEVANT CONTEXT FROM YOUR ARCHIVE (Reranked) ---\n";
            ragContext += ragSources
                .map(c => `[Source: ${c.documentName} (Score: ${c.rerankScore?.toFixed(2) || 'N/A'})]\n${c.chunkContent}\n`)
                .join('---\n');
            const finalPrompt = `${ragContext}\n\nUser Query: ${prompt}`;

            const synthMsg = await handleSendMessageInternal(finalPrompt, undefined, undefined, TaskType.Chat, true, false);
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: synthMsg.content, isLoading: false } } });

        } catch (e) {
            console.error("RAG pipeline failed:", e);
            handleApiError(e, assistantMsgId, true);
        }
    };

    const handleSendMessageInternal = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isPlanStep: boolean = false, manageLoadingState: boolean = true, onStreamUpdate?: (streamedText: string) => void): Promise<ChatMessage> => {
        return new Promise(async (resolve, reject) => {
            const assistantMsgId = isPlanStep ? `step-${Date.now()}` : Date.now().toString();
            let routedTask = forcedTask;
            let finalPrompt = prompt;
            
            try {
                if (!routedTask) {
                    const initialWorkflow: WorkflowState = { 'node-1': { status: 'running', startTime: Date.now(), details: 'Routing user query...' } };
                    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, workflowState: initialWorkflow };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });

                    const routerHistory = state.messages.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: m.content }] }));
                    const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                    const proposedRoute = routerResp.functionCalls?.[0]?.args.route as string | undefined;

                    if (proposedRoute && AGENT_ROSTER.hasOwnProperty(proposedRoute)) {
                        routedTask = proposedRoute as TaskType;
                    } else {
                        routedTask = TaskType.Chat;
                    }
                } else if (!isPlanStep) {
                     const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: routedTask };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
                }
                
                if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
                
                if (routedTask === TaskType.ManualRAG && !isPlanStep) {
                    await runRerankPipeline(prompt, assistantMsgId);
                    const finalMessage = state.messages.find(m => m.id === assistantMsgId) || state.messages[state.messages.length - 1];
                    resolve(finalMessage); 
                    return;
                }

                const agentConfig = AGENT_ROSTER[routedTask];
                const graphConfig = agentGraphConfigs[routedTask];
                const workflowState: WorkflowState = {};
                if (graphConfig) {
                    graphConfig.nodes.forEach(node => { workflowState[`node-${node.id}`] = { status: 'pending' }; });
                }
                if(workflowState['node-1'] && !isPlanStep) {
                    workflowState['node-1'] = { status: 'completed', endTime: Date.now(), details: { routed_to: routedTask } };
                    workflowState['node-2'] = { status: 'running', startTime: Date.now() };
                }

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { taskType: routedTask, workflowState } } });
                
                const chat = getChat(routedTask, state.messages);
                
                const parts: Part[] = [{ text: finalPrompt }];
                if (file) parts.push(fileToGenerativePart(file));

                const stream = await chat.sendMessageStream({ message: { role: 'user', parts } });
                const streamOutput = await processStream(stream, assistantMsgId, onStreamUpdate);
                
                if (workflowState['node-2'] && !isPlanStep) {
                    updateWorkflowState(assistantMsgId, 2, { status: 'completed', details: { output: streamOutput.fullText.substring(0, 200) + '...' } });
                }
                
                let vizSpec: VizSpec | undefined = undefined;
                if (routedTask === TaskType.DataAnalyst) {
                    try {
                        const jsonMatch = streamOutput.fullText.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                        if (jsonMatch) {
                            const parsedJson = JSON.parse(jsonMatch[0]);
                            if (parsedJson.type && parsedJson.data && parsedJson.dataKey && parsedJson.categoryKey) {
                                vizSpec = parsedJson;
                                streamOutput.fullText = "Here is the data visualization you requested:";
                            }
                        }
                    } catch (e) {
                        console.error("Failed to parse VizSpec JSON:", e);
                        streamOutput.fullText = `[DataAnalyst Error: Failed to generate valid VizSpec JSON]\n\n${streamOutput.fullText}`;
                    }
                }

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { isLoading: false, vizSpec, content: streamOutput.fullText } } });

                const finalMessage: ChatMessage = { 
                    id: assistantMsgId, 
                    role: 'assistant' as const, 
                    content: streamOutput.fullText, 
                    isLoading: false, 
                    sources: streamOutput.sources, 
                    functionCalls: streamOutput.functionCalls, 
                    ragSources: [],
                    vizSpec
                };
                resolve(finalMessage);

            } catch(e) {
                handleApiError(e, assistantMsgId, manageLoadingState);
                reject(e);
            }
        });
    }, [state.messages, ai, persona, processStream, dispatch, handleApiError, getChat, sessionFeedback, findSimilar, generateEmbedding, updateWorkflowState]);

    const initiateSelfCorrection = useCallback(async (plan: Plan, fullPlanTrace: any[]): Promise<Plan> => {
        const failedStep = plan.plan.find(p => p.status === 'failed');
        if (!failedStep) {
            throw new Error("Self-correction called without a failed step.");
        }
    
        fullPlanTrace.push({ event: 'self_correction_initiated', step: failedStep.step_id });
    
        const original_prompt = failedStep.description;
        const failed_output = failedStep.result || 'No error output.';
        const critique = `This plan step failed with the following error: ${failed_output}`;
        const apoPrompt = `[Prompt]: ${original_prompt}\n[Failed Output]: ${failed_output}\n[Critique]: ${critique}`;
    
        // 1. Call Retry Agent to get a new goal for the planner
        const retryMessage = await handleSendMessageInternal(apoPrompt, undefined, undefined, TaskType.Retry, true, false);
        const newPlannerGoal = retryMessage.content;
        fullPlanTrace.push({ event: 'apo_success', new_goal: newPlannerGoal });
    
        // 2. Call Planner with the new, corrected goal
        const newPlanMessage = await handleSendMessageInternal(newPlannerGoal, undefined, undefined, TaskType.Planner, false, false);
    
        // 3. Parse and return the new plan
        let parsedPlan: Plan | undefined;
        try {
            const jsonMatch = newPlanMessage.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
            if (jsonMatch) {
                const planJson = JSON.parse(jsonMatch[0]);
                if (planJson.plan && Array.isArray(planJson.plan)) {
                    parsedPlan = { id: `plan-${newPlanMessage.id}`, plan: planJson.plan.map((step: any) => ({ ...step, status: 'pending' })) };
                }
            }
        } catch (e) {
            console.error("Failed to parse new plan from retry message:", e, "Content:", newPlanMessage.content);
        }

        if (parsedPlan) {
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: newPlanMessage.id, update: { plan: parsedPlan, content: '' } } });
            fullPlanTrace.push({ event: 'new_plan_generated', plan: parsedPlan });
            return parsedPlan;
        } else {
            throw new Error("Self-correction (Reflexion) failed to generate a new, valid plan.");
        }
    }, [handleSendMessageInternal, dispatch]);

    const handleExecutePlan = useCallback(async (plan: Plan, fullPlanTrace: any[]): Promise<string> => {
        // This handles manual retries from the UI button.
        const manualRetryStep = plan.plan.find(p => p.status === 'failed');
        if (manualRetryStep) {
            try {
                dispatch({ type: 'SET_LOADING', payload: true });
                const newPlan = await initiateSelfCorrection(plan, fullPlanTrace);
                return await handleExecutePlan(newPlan, fullPlanTrace); // Recursive call with new plan
            } catch (e) {
                const error = e as Error;
                const errorResult = `Self-Correction Error: ${error.message || parseApiErrorMessage(e)}`;
                fullPlanTrace.push({ event: 'retry_failed', details: errorResult });
                return errorResult;
            } finally {
                 dispatch({ type: 'SET_LOADING', payload: false });
            }
        }

        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: plan.id } });
    
        const planState: Record<string, any> = {};
        let pendingSteps = plan.plan.filter(step => step.status === 'pending');
        
        while (pendingSteps.length > 0) {
            const executableSteps = pendingSteps.filter(step => !step.inputs || step.inputs.every(inputKey => planState.hasOwnProperty(inputKey)));
    
            if (executableSteps.length === 0) {
                const errorResult = "Plan stalled due to missing dependencies.";
                fullPlanTrace.push({ event: 'plan_failed', details: errorResult });
                dispatch({ type: 'SET_LOADING', payload: false });
                return errorResult;
            }
    
            executableSteps.forEach(step => {
                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress' } });
            });
    
            const stepPromises = executableSteps.map(async step => {
                const toolName = step.tool_to_use as TaskType;
                if (!AGENT_ROSTER.hasOwnProperty(toolName)) {
                    throw new Error(`Plan referenced an unknown agent: '${toolName}'.`);
                }
                
                let stepDescription = step.description;
                if (step.inputs) {
                    for (const key of step.inputs) {
                        const inputData = planState[key] || '';
                        stepDescription = stepDescription.replace(new RegExp(`\\{${key}\\}`, 'g'), typeof inputData === 'string' ? inputData : JSON.stringify(inputData));
                    }
                }

                if (toolName === TaskType.ManualRAG) {
                    const queryVector = await generateEmbedding(stepDescription);
                    const similarChunks = await findSimilar(queryVector, 10);
                    const ragSources = similarChunks.map(c => ({ documentName: c.source, chunkContent: c.text, similarityScore: c.similarity }));
                    return { step, resultMessage: { content: JSON.stringify(ragSources), id: '' } };
                }
                
                if (toolName === TaskType.Reranker) {
                    const rerankerPrompt = AGENT_ROSTER[TaskType.Reranker].systemInstruction
                        .replace('{query}', stepDescription)
                        .replace('{chunks_json}', planState[step.inputs![0]]);
                    
                    return { step, resultMessage: await handleSendMessageInternal(rerankerPrompt, undefined, undefined, TaskType.Reranker, true, false) };
                }
                
                if (toolName === TaskType.Chat && step.inputs?.includes(step.output_key)) {
                    let rerankedSources: RagSource[] = [];
                    try {
                        const parsed = JSON.parse(planState[step.inputs![0]]);
                        const chunks = parsed.reranked_chunks || parsed; // Handle both direct array and object
                        rerankedSources = chunks
                            .map((c: any) => ({ documentName: c.documentName, chunkContent: c.chunkContent, rerankScore: c.rerankScore }))
                            .sort((a: RagSource, b: RagSource) => (b.rerankScore || 0) - (a.rerankScore || 0))
                            .slice(0, 5);
                    } catch (e) { console.error("Reranker step failed to provide valid JSON for synthesizer", e); }
                    
                    let ragContext = "--- RELEVANT CONTEXT FROM YOUR ARCHIVE (Reranked) ---\n";
                    ragContext += rerankedSources
                        .map(c => `[Source: ${c.documentName} (Score: ${c.rerankScore?.toFixed(2) || 'N/A'})]\n${c.chunkContent}\n`)
                        .join('---\n');
                    stepDescription = `${ragContext}\n\nUser Query: ${stepDescription}`;
                }

                const resultMessage = await handleSendMessageInternal(
                    stepDescription, undefined, undefined, toolName, true, false,
                    (streamedText) => {
                        dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress', result: streamedText + ' |'} });
                    }
                );
                return { step, resultMessage };
            });
    
            const results = await Promise.allSettled(stepPromises);
            let aStepFailedInThisBatch = false;

            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const { step, resultMessage } = result.value;
                    let outputData = resultMessage.content;

                    const codeCall = resultMessage.functionCalls?.find(fc => fc.name === 'code_interpreter');
                    if (codeCall && codeCall.args.code) {
                        const codeResult = await runPythonCode(codeCall.args.code);
                        outputData = codeResult.success ? codeResult.output : `Execution Failed: ${codeResult.error}`;
                        if (resultMessage.id) {
                            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: resultMessage.id, update: { content: `Code execution result:\n${outputData}`, functionCalls: resultMessage.functionCalls.map(fc => fc.id === codeCall.id ? {...fc, isAwaitingExecution: false} : fc) }}});
                        }
                    }

                    if (step.output_key) {
                        planState[step.output_key] = outputData;
                    }
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: outputData } });
                    fullPlanTrace.push({ event: 'step_completed', step: step.step_id, result: outputData });
                } else { // 'rejected'
                    aStepFailedInThisBatch = true;
                    const errorReason = result.reason as any;
                    const errorResult = `Step failed: ${errorReason.message || parseApiErrorMessage(result.reason)}`;
                    fullPlanTrace.push({ event: 'step_failed', details: errorResult });
                    // Find the step that corresponds to this failed promise
                    const failedStep = executableSteps[results.indexOf(result)];
                    if (failedStep) {
                        dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: failedStep.step_id, status: 'failed', result: errorResult } });
                    }
                }
            }
            
            if (aStepFailedInThisBatch) {
                // Autonomous self-correction is triggered
                try {
                    const currentMessage = state.messages.find(msg => msg.plan?.id === plan.id);
                    if (currentMessage && currentMessage.plan) {
                        const newPlan = await initiateSelfCorrection(currentMessage.plan, fullPlanTrace);
                        return await handleExecutePlan(newPlan, fullPlanTrace); // Recursive call with the new corrected plan
                    } else {
                        throw new Error("Could not find the current plan in state to initiate self-correction.");
                    }
                } catch (e) {
                    const error = e as Error;
                    const errorResult = `Self-Correction mechanism failed: ${error.message || parseApiErrorMessage(e)}`;
                    fullPlanTrace.push({ event: 'retry_failed', details: errorResult });
                    dispatch({ type: 'SET_LOADING', payload: false });
                    return errorResult;
                }
            }
            
            const executedStepIds = executableSteps.map(s => s.step_id);
            pendingSteps = pendingSteps.filter(s => !executedStepIds.includes(s.step_id));
        }
        
        const finalResult = Object.values(planState).pop() || "Plan executed successfully.";
        fullPlanTrace.push({ event: 'plan_success', result: finalResult });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: undefined } });
        dispatch({ type: 'SET_LOADING', payload: false });
        return finalResult;
    }, [handleSendMessageInternal, dispatch, runPythonCode, generateEmbedding, findSimilar, initiateSelfCorrection, state.messages]);
    
    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => {
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file };
        dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: userMsg } });
        
        const fullPlanTrace: any[] = [{ event: 'start', user_prompt: prompt, swarm_mode: swarmMode }];
        const finalAssistantMsgId = (parseInt(userMsg.id) + 1).toString();
        
        try {
            if (swarmMode === SwarmMode.InformalCollaborators) {
                 if (file && (file.type === 'text/csv' || file.type === 'application/json' || file.type === 'text/plain')) {
                    await handleSendMessageInternal(prompt, file, repoUrl, TaskType.DataAnalyst);
                    return;
                }
                
                if (forcedTask) {
                    await handleSendMessageInternal(prompt, file, repoUrl, forcedTask);
                    return;
                }
                
                const agentList = activeRoster.filter(t => t !== TaskType.Reranker).join(', ');
                const plannerPrompt = `User goal is '${prompt}'. You MUST create a plan using only the following agents: ${agentList}.`;
                fullPlanTrace.push({ event: 'invoke_planner', prompt: plannerPrompt });
                const planMessage = await handleSendMessageInternal(plannerPrompt, file, repoUrl, TaskType.Planner, false, false);
                
                let parsedPlan: Plan | undefined;
                try {
                    const jsonMatch = planMessage.content.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
                    if (jsonMatch) {
                        const planJson = JSON.parse(jsonMatch[0]);
                        if (planJson.plan && Array.isArray(planJson.plan)) {
                            parsedPlan = { id: `plan-${planMessage.id}`, plan: planJson.plan.map((step: any) => ({ ...step, status: 'pending' })) };
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse plan from assistant message:", e, "Content:", planMessage.content);
                }

                if (parsedPlan) {
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: planMessage.id, update: { plan: parsedPlan, content: '' } } });
                    fullPlanTrace.push({ event: 'plan_received', plan: parsedPlan });
                    const finalResult = await handleExecutePlan(parsedPlan, fullPlanTrace);
                    
                    const reportPrompt = `You are a Swarm Evaluator. Here is the full execution trace of a multi-agent swarm. Provide a 'Supervisor's Report' evaluating the swarm's efficiency and logic.\n\nTRACE:\n${JSON.stringify(fullPlanTrace, null, 2)}`;
                    const reportMsg = await handleSendMessageInternal(reportPrompt, undefined, undefined, TaskType.Critique, false, false);
                    
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: planMessage.id, update: { content: finalResult, supervisorReport: reportMsg.content, isLoading: false } } });
                } else {
                    if (planMessage.content && !planMessage.content.includes("I was unable to generate a valid plan")) {
                        dispatch({
                            type: 'UPDATE_ASSISTANT_MESSAGE',
                            payload: {
                                messageId: planMessage.id,
                                update: {
                                    isLoading: false
                                },
                            },
                        });
                    } else {
                        dispatch({
                            type: 'UPDATE_ASSISTANT_MESSAGE',
                            payload: {
                                messageId: planMessage.id,
                                update: {
                                    content: "I was unable to generate a valid plan for this request. The Planner agent did not return a valid JSON object. Please try rephrasing your goal.",
                                    isLoading: false,
                                },
                            },
                        });
                    }
                }
            } else { // Security Service
                 dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: {id: finalAssistantMsgId, role: 'assistant', content: "Executing Security Service pipeline... (mocked for now)", isLoading: false} } });
            }
        } catch (e) {
            const errorMsg = parseApiErrorMessage(e);
             dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: {id: finalAssistantMsgId, role: 'assistant', content: `Swarm execution failed: ${errorMsg}`, isLoading: false} } });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [swarmMode, activeRoster, handleSendMessageInternal, handleExecutePlan, dispatch]);

    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string, codeOverride?: string) => {
        console.log("handleExecuteCode called (currently handled in plan execution)", messageId, functionCallId);
    }, []);

    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);

    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan, addSessionFeedback };
};
