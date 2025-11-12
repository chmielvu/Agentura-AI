import React, { useReducer, useCallback, useMemo, useEffect, useRef, useState } from 'react'; 
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall, CritiqueResult, GroundingSource, AgenticState, WorkflowState, WorkflowStepState, SwarmMode, VizSpec, RagSource } from '../../types';
import { APP_VERSION, AGENT_ROSTER, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL } from '../../constants';
import { extractSources, fileToGenerativePart } from './helpers';
import { agentGraphConfigs } from '../components/graphConfigs';

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
                            plan: msg.plan.plan.map(step =>
                                step.step_id === stepId ? { ...step, status, ...(result !== undefined && { result }) } : step
                            )
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
        if (!pyodideRef.current) return { success: false, output: "", error: "Pyodide is not initialized."};
        try {
          pyodideRef.current.runPython(`import sys, io; sys.stdout = io.StringIO()`);
          const result = await pyodideRef.current.runPythonAsync(code);
          const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
          return { success: true, output: stdout || result?.toString() || "Code executed without output." };
        } catch (err: any) { 
            return { success: false, output: "", error: err.message };
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
          dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { content: fullText, sources, functionCalls } } });
          if (onStreamUpdate) onStreamUpdate(fullText);
        }
        return { fullText, sources, functionCalls };
    }, [dispatch]);
    
    const handleSendMessageInternal = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isPlanStep: boolean = false, manageLoadingState: boolean = true, onStreamUpdate?: (streamedText: string) => void): Promise<ChatMessage> => {
        return new Promise(async (resolve, reject) => {
            const assistantMsgId = Date.now().toString();
            
            try {
                let routedTask = forcedTask;

                if (!routedTask) {
                    const initialWorkflow: WorkflowState = { 'node-1': { status: 'running', startTime: Date.now(), details: 'Routing user query...' } };
                    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, workflowState: initialWorkflow };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });

                    const routerHistory = state.messages.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
                    const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                    routedTask = routerResp.functionCalls?.[0]?.args.route as TaskType || TaskType.Chat;
                } else {
                     const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: `Executing: ${prompt}`, isLoading: true, taskType: routedTask };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
                }

                if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
                
                const agentConfig = AGENT_ROSTER[routedTask];
                const graphConfig = agentGraphConfigs[routedTask];
                const workflowState: WorkflowState = {};
                if (graphConfig) {
                    graphConfig.nodes.forEach(node => { workflowState[`node-${node.id}`] = { status: 'pending' }; });
                }
                if(workflowState['node-1']) {
                    workflowState['node-1'] = { status: 'completed', endTime: Date.now(), details: { routed_to: routedTask } };
                    workflowState['node-2'] = { status: 'running', startTime: Date.now() };
                }

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { taskType: routedTask, workflowState } } });
                
                const chat = getChat(routedTask, state.messages);
                
                const parts: Part[] = [{ text: prompt }];
                if (file) parts.push(fileToGenerativePart(file));

                const stream = await chat.sendMessageStream({ message: { role: 'user', parts } });
                const streamOutput = await processStream(stream, assistantMsgId, onStreamUpdate);
                
                updateWorkflowState(assistantMsgId, 2, { status: 'completed', details: { output: streamOutput.fullText.substring(0, 200) + '...' } });
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { isLoading: false } } });

                const finalMessage = { id: assistantMsgId, role: 'assistant' as const, content: streamOutput.fullText, isLoading: false, sources: streamOutput.sources, functionCalls: streamOutput.functionCalls };
                resolve(finalMessage);

            } catch(e: any) {
                handleApiError(e, assistantMsgId, manageLoadingState);
                reject(e);
            }
        });
    }, [state.messages, ai, persona, processStream, dispatch, handleApiError, getChat, sessionFeedback]);

    const handleExecutePlan = useCallback(async (plan: Plan, fullPlanTrace: any[]): Promise<string> => {
        const failedStep = plan.plan.find(p => p.status === 'failed');
    
        if (failedStep) {
            // --- THIS IS THE REFLEXION LOOP (RETRY) ---
            dispatch({ type: 'SET_LOADING', payload: true });
            fullPlanTrace.push({ event: 'retry_initiated', step: failedStep.step_id });
    
            const original_prompt = failedStep.description;
            const failed_output = failedStep.result || 'No error output.';
            const critique = `This step failed with the following error: ${failed_output}`;
            const apoPrompt = `[Prompt]: ${original_prompt}\n[Failed Output]: ${failed_output}\n[Critique]: ${critique}`;
    
            try {
                const retryMessage = await handleSendMessageInternal(
                    apoPrompt, undefined, undefined, TaskType.Retry, true, false
                );
    
                const newPlannerGoal = retryMessage.content;
                fullPlanTrace.push({ event: 'apo_success', new_goal: newPlannerGoal });
    
                const newPlanMessage = await handleSendMessageInternal(
                    newPlannerGoal, undefined, undefined, TaskType.Planner, false, false
                );
    
                if (newPlanMessage.plan) {
                    fullPlanTrace.push({ event: 'new_plan_generated', plan: newPlanMessage.plan });
                    return await handleExecutePlan(newPlanMessage.plan, fullPlanTrace);
                } else {
                    throw new Error("Self-correction (Reflexion) failed to generate a new plan.");
                }
    
            } catch (e) {
                const errorResult = `Self-Correction Error: ${parseApiErrorMessage(e)}`;
                fullPlanTrace.push({ event: 'retry_failed', details: errorResult });
                return errorResult;
            } finally {
                dispatch({ type: 'SET_LOADING', payload: false });
            }
        }

        // --- THIS IS THE STANDARD (NON-RETRY) EXECUTION ---
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: plan.id } });
    
        const planState: Record<string, any> = {};
        
        let pendingSteps = plan.plan.filter(step => step.status === 'pending' || step.status === 'failed');
        
        while (pendingSteps.length > 0) {
            const executableSteps = pendingSteps.filter(step => 
                !step.inputs || step.inputs.every(inputKey => planState.hasOwnProperty(inputKey))
            );
    
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
                let stepDescription = step.description;
                if (step.inputs) {
                    for (const key of step.inputs) {
                        stepDescription = stepDescription.replace(new RegExp(`\\{${key}\\}`, 'g'), planState[key] || '');
                    }
                }
                const resultMessage = await handleSendMessageInternal(stepDescription, undefined, undefined, step.tool_to_use as TaskType, true, false);
                return { step, resultMessage };
            });
    
            const results = await Promise.allSettled(stepPromises);
            
            for (const result of results) {
                if (result.status === 'fulfilled') {
                    const { step, resultMessage } = result.value;
                    let outputData = resultMessage.content;
                    if (step.output_key) {
                        planState[step.output_key] = outputData;
                    }
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: outputData } });
                    fullPlanTrace.push({ event: 'step_completed', step: step.step_id, result: outputData });
                } else {
                    const errorResult = `Step failed: ${parseApiErrorMessage(result.reason)}`;
                    fullPlanTrace.push({ event: 'plan_failed', details: errorResult });
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
    }, [handleSendMessageInternal, dispatch]);
    
    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => {
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file };
        dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: userMsg } });
        
        const fullPlanTrace: any[] = [{ event: 'start', user_prompt: prompt, swarm_mode: swarmMode }];
        const finalAssistantMsgId = (parseInt(userMsg.id) + 1).toString();
        
        try {
            if (swarmMode === SwarmMode.InformalCollaborators) {
                const plannerPrompt = `User goal is '${prompt}'. You MUST create a plan using only the following agents: ${activeRoster.join(', ')}.`;
                fullPlanTrace.push({ event: 'invoke_planner', prompt: plannerPrompt });
                const planMessage = await handleSendMessageInternal(plannerPrompt, file, repoUrl, TaskType.Planner, false, false);
                
                if (planMessage.plan) {
                    fullPlanTrace.push({ event: 'plan_received', plan: planMessage.plan });
                    const finalResult = await handleExecutePlan(planMessage.plan, fullPlanTrace);
                    
                    const reportPrompt = `You are a Swarm Evaluator. Here is the full execution trace of a multi-agent swarm. Provide a 'Supervisor's Report' evaluating the swarm's efficiency and logic.\n\nTRACE:\n${JSON.stringify(fullPlanTrace, null, 2)}`;
                    const reportMsg = await handleSendMessageInternal(reportPrompt, undefined, undefined, TaskType.Critique, false, false);
                    
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: planMessage.id, update: { content: finalResult, supervisorReport: reportMsg.content, isLoading: false } } });
                } else {
                    throw new Error("Planner failed to generate a plan.");
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
        // This function's core logic remains the same, but might need context from the new orchestrator flow
        // For now, it is assumed to be called within a plan step.
    }, [state.messages, runPythonCode, updateWorkflowState, handleSendMessageInternal]);

    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);

    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan, addSessionFeedback };
};