/**
 * Agentura AI (v3.0) - Modular Orchestrator Hook (High-Intelligence Normal Mode)
 *
 * This version modifies the routing logic to allow all non-destructive agentic
 * capabilities (Code, Complex, Creative, Research) in Normal Mode, while strictly
 * blocking only the Planner (app modification/deployment logic).
 */
import React, { useReducer, useCallback, useMemo, useEffect, useRef } from 'react'; 
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall, CritiqueResult, GroundingSource, AgenticState, WorkflowState, WorkflowStepState, ChatMode, VizSpec } from '../../types';
import { APP_VERSION, TASK_CONFIGS, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL } from '../../constants';
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
                                step.step_id === stepId ? { ...step, status, result } : step
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

// ENHANCEMENT: Create a pure function for parsing error messages
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
    mode: ChatMode,
    pyodideRef: React.MutableRefObject<any>
) => {
    const [state, dispatch] = useReducer(orchestratorReducer, initialState);
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY as string }), []);
    const retryCountRef = useRef(0);

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

    // ENHANCEMENT: Use the new parseApiErrorMessage function
    const handleApiError = useCallback((e: any, assistantMessageId: string, manageLoadingState: boolean) => {
        const errorMessage = parseApiErrorMessage(e);
        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false, content: errorMessage } } });
        if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
        throw e; // Re-throw for plan execution to catch
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

    const processStream = useCallback(async (stream: AsyncGenerator<GenerateContentResponse>, assistantMessageId: string) => {
        let fullText = '', sources: GroundingSource[] = [], functionCalls: FunctionCall[] = [];
        for await (const chunk of stream) {
          if (chunk.text) fullText += chunk.text;
          if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls.map(fc => ({ id: `fc-${Date.now()}`, name: fc.name, args: fc.args })));
          const newSources = extractSources(chunk);
          sources = Array.from(new Map([...sources, ...newSources].map(s => [s.uri, s])).values());
          dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { content: fullText, sources, functionCalls } } });
        }
        return { fullText, sources, functionCalls };
    }, [dispatch]);
    
    const continueCodePwcLoop = useCallback(async (codeOutput: string, assistantMessageId: string, originalUserQuery: string, vizSpec?: VizSpec) => {
        updateWorkflowState(assistantMessageId, 4, { status: 'running', details: { code_output: codeOutput }});
        const synthesisPrompt = `The user's query was: "${originalUserQuery}". I ran some code and the output was:\n\n${codeOutput}\n\nPlease synthesize this result into a natural language answer for the user.`;
        
        const taskConfig = TASK_CONFIGS[TaskType.Chat]; // Use a simple chat agent for synthesis
        const chat = ai.chats.create({ model: taskConfig.model });
        
        const finalAssistantMsgId = Date.now().toString();
        const finalAssistantMsg: ChatMessage = { id: finalAssistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat };
        dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: finalAssistantMsg }});
        
        const stream = await chat.sendMessageStream({ message: synthesisPrompt });
        await processStream(stream, finalAssistantMsgId);

        // Final update with viz spec and loading state
        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: finalAssistantMsgId, update: { isLoading: false, vizSpec } } });
        updateWorkflowState(assistantMessageId, 4, { status: 'completed' });
        
    }, [ai, state.messages, updateWorkflowState, processStream, dispatch]);

    const handleStreamEnd = useCallback(async (chat: Chat, assistantMessageId: string, routedTask: TaskType, originalUserQuery: string, streamOutput: { fullText: string; sources: GroundingSource[], functionCalls?: FunctionCall[] }, manageLoadingState: boolean) => {
        const { fullText, sources, functionCalls } = streamOutput;

        const executeComplexPwcLoop = async (v1Output: string) => {
            updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: { v1_output: v1Output } });
            
            updateWorkflowState(assistantMessageId, 3, { status: 'running', details: { input_for_critique: `Query: ${originalUserQuery}\n\nOutput (first 500 chars): ${v1Output.substring(0, 500)}...` } });
            const criticConfig = TASK_CONFIGS[TaskType.Critique];
            let critique: CritiqueResult | null = null;
            try {
                // Pass sources to the critic for Research tasks
                const critiqueInput = `Query: ${originalUserQuery}\nOutput: ${v1Output}` + (sources.length > 0 ? `\nSources: ${JSON.stringify(sources)}` : '');
                const resp = await ai.models.generateContent({ model: criticConfig.model, contents: { parts: [{ text: critiqueInput }] }, config: criticConfig.config });
                critique = JSON.parse(resp.text) as CritiqueResult;
                updateWorkflowState(assistantMessageId, 3, { status: 'completed', details: critique });
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { critique } } });
            } catch (e: any) {
                updateWorkflowState(assistantMessageId, 3, { status: 'failed', details: { error: e.message || "Unknown error parsing critique" } });
            }
            
            const avgScore = critique ? (critique.scores.faithfulness + critique.scores.coherence + critique.scores.coverage) / 3 : 5;
            
            if (critique && avgScore < 4 && retryCountRef.current < 1) {
                retryCountRef.current++;
                updateWorkflowState(assistantMessageId, 4, { status: 'running', details: { reason: 'Critique score low. Handing off to Retry agent.', critique } });
                const retryMsgId = Date.now().toString();
                
                const retryAssistantMsg: ChatMessage = { id: retryMsgId, role: 'assistant', isLoading: true, content: '', taskType: TaskType.Retry, workflowState: { 'node-1': { status: 'running' } }};
                dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: retryAssistantMsg }});

                const retryPrompt = `Critique: ${critique.critique}. Retry query: ${originalUserQuery}`;
                const stream = await chat.sendMessageStream({ message: [{ text: retryPrompt }] });
                await processStream(stream, retryMsgId);
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: retryMsgId, update: { isLoading: false } } });
                updateWorkflowState(assistantMessageId, 4, { status: 'completed', details: { reason: 'Handed off to Retry agent.', critique } });
            } else {
                updateWorkflowState(assistantMessageId, 4, { status: 'completed', details: { reason: 'Final answer synthesized.', ...(critique && { critique: critique }) } });
                if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
            }
        };

        if (routedTask === TaskType.Complex || routedTask === TaskType.Research) {
            await executeComplexPwcLoop(fullText);
        } else if (functionCalls && functionCalls.length > 0) {
            if (functionCalls.some(fc => fc.name === 'code_interpreter')) {
                updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: { function_calls: functionCalls } });
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false, functionCalls: functionCalls.map(fc => ({...fc, isAwaitingExecution: true})) } } });
                if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
            } else {
                // ... (mock tool execution logic)
            }
        } else {
            updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: { output: fullText } });
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false } } });
            if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [ai, updateWorkflowState, processStream, dispatch]);
    
    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isPlanStep: boolean = false, manageLoadingState: boolean = true): Promise<ChatMessage> => {
        return new Promise(async (resolve, reject) => {
            if (state.isLoading && manageLoadingState) {
                // Find and return a placeholder/dummy message or reject
                const loadingMsg = state.messages.find(m => m.isLoading);
                if (loadingMsg) resolve(loadingMsg);
                else reject(new Error("Another message is already being processed."));
                return;
            }

            retryCountRef.current = 0;
            
            if (manageLoadingState) {
                const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file };
                dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: userMsg } });
            }
            
            const assistantMsgId = Date.now().toString();
            let finalAssistantMessage: ChatMessage | null = null;
            
            // This function will be called by handleStreamEnd to resolve the promise
            const messageCompleteCallback = (message: ChatMessage) => {
                finalAssistantMessage = message;
                resolve(message);
            };

            const fullHistory = [...state.messages];

            try {
                let routedTask = forcedTask;

                if (!routedTask) {
                    const initialWorkflow: WorkflowState = { 'node-1': { status: 'running', startTime: Date.now(), details: 'Routing user query...' } };
                    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, workflowState: initialWorkflow };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });

                    const routerHistory = fullHistory.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
                    const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                    routedTask = routerResp.functionCalls?.[0]?.args.route as TaskType || TaskType.Chat;
                } else {
                    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: `Executing: ${prompt}`, isLoading: true, taskType: routedTask };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
                }

                if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
                
                if (mode === ChatMode.Normal && routedTask === TaskType.Planner) {
                    routedTask = TaskType.Chat;
                    const update = { content: `**Mode Constraint:** Task routed to *Chat* mode. Planning is disabled. Switch to **Developer** mode to enable.`, isLoading: false };
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update } });
                    if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
                    const finalMsg = state.messages.find(m => m.id === assistantMsgId) || { id: assistantMsgId, role: 'assistant', ...update};
                    resolve(finalMsg as ChatMessage);
                    return;
                }
                
                const taskConfig = TASK_CONFIGS[routedTask];
                const graphConfig = agentGraphConfigs[routedTask];
                const workflowState: WorkflowState = {};
                if (graphConfig) {
                    graphConfig.nodes.forEach(node => { workflowState[`node-${node.id}`] = { status: 'pending' }; });
                }
                workflowState['node-1'] = { status: 'completed', endTime: Date.now(), details: { routed_to: routedTask } };
                workflowState['node-2'] = { status: 'running', startTime: Date.now() };

                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { taskType: routedTask, workflowState } } });

                const personaInstruction = PERSONA_CONFIGS[persona].instruction;
                const systemInstruction = [personaInstruction, taskConfig.config?.systemInstruction?.parts[0]?.text].filter(Boolean).join('\n\n');
                const history: Content[] = fullHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{text: m.content}] }));

                const chat = ai.chats.create({ model: taskConfig.model, config: { ...taskConfig.config, ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }) }, history });
                
                const parts: Part[] = [{ text: prompt }];
                if (file) parts.push(fileToGenerativePart(file));
                const stream = await chat.sendMessageStream({ message: parts });
                const streamOutput = await processStream(stream, assistantMsgId);
                
                await handleStreamEnd(chat, assistantMsgId, routedTask, prompt, streamOutput, manageLoadingState);

                // After handleStreamEnd completes, the final message should be in state
                // This is a bit of a hack to wait for the state to update
                setTimeout(() => {
                    const finalMsg = state.messages.find(m => m.id === assistantMsgId && !m.isLoading);
                    if (finalMsg) {
                        resolve(finalMsg);
                    } else if (finalAssistantMessage) {
                        resolve(finalAssistantMessage)
                    } else {
                         // Fallback in case state update is slow
                        const fallbackMsg = state.messages.find(m => m.id === assistantMsgId) || {id: assistantMsgId, role:'assistant', content: streamOutput.fullText};
                        resolve(fallbackMsg as ChatMessage)
                    }
                }, 100);

            } catch(e: any) {
                handleApiError(e, assistantMsgId, manageLoadingState);
                reject(e);
            }
        });
    }, [state.isLoading, state.messages, ai, persona, handleStreamEnd, processStream, dispatch, mode, handleApiError]);

    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string, codeOverride?: string) => {
        const msg = state.messages.find(m => m.id === messageId);
        const fc = msg?.functionCalls?.find(f => f.id === functionCallId);
        if (!msg || !fc) return;

        const codeToRun = codeOverride ?? fc.args.code;
        updateWorkflowState(messageId, 3, { status: 'running', details: { code_to_run: codeToRun } });

        const result = await runPythonCode(codeToRun);
        const originalUserQuery = state.messages.find(m => m.role === 'user' && !m.content.startsWith('[Task]: My code execution failed'))?.content || 'the user\'s request';
        
        if (result.success) {
            updateWorkflowState(messageId, 3, { status: 'completed', details: { code_to_run: codeToRun, output: result.output } });

            let vizSpec: VizSpec | undefined = undefined;
            let cleanOutput = result.output;

            if (result.output.includes('VIZ_SPEC:')) {
                const vizMatch = result.output.match(/VIZ_SPEC:\s*({.*})/s);
                if (vizMatch && vizMatch[1]) {
                    try {
                        vizSpec = JSON.parse(vizMatch[1]);
                        cleanOutput = result.output.replace(/VIZ_SPEC:\s*({.*})/s, '').trim();
                    } catch (e) { /* failed to parse, leave output as-is */ }
                }
            }
            await continueCodePwcLoop(cleanOutput, messageId, originalUserQuery, vizSpec);
        } else {
             // AUTONOMOUS DEBUGGING (REFLEXION LOOP)
            updateWorkflowState(messageId, 3, { status: 'failed', details: { code_to_run: codeToRun, error: result.error } });
            const debugPrompt = `[Task]: My code execution failed.
[Original Query]: ${originalUserQuery}
[Failed Code]:
${codeToRun}
[Error Message]: ${result.error}
[Instruction]: Analyze the error and provide the corrected, full Python code block. You MUST call 'code_interpreter' with the fixed code.`;
            await handleSendMessage(debugPrompt, undefined, undefined, TaskType.Code, false, false);
        }
        
    }, [state.messages, runPythonCode, updateWorkflowState, continueCodePwcLoop, handleSendMessage]);
    
    const handleExecutePlan = useCallback(async (plan: Plan) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: plan.id } });
    
        const planState: Record<string, any> = {};
        // Pre-populate state from any already completed steps (for retries)
        plan.plan.forEach(step => {
            if (step.status === 'completed' && step.output_key && step.result) {
                planState[step.output_key] = step.result;
            }
        });

        const stepsToExecute = plan.plan
            .filter(step => step.status === 'pending' || step.status === 'failed')
            .sort((a, b) => a.step_id - b.step_id);
    
        for (const step of stepsToExecute) {
            dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress' } });
            
            // Input Resolution
            let stepDescription = step.description;
            if (step.inputs) {
                for (const key of step.inputs) {
                    const data = planState[key] || `[ERROR: No data for ${key}]`;
                    stepDescription = stepDescription.replace(new RegExp(`\\{${key}\\}`, 'g'), data);
                }
            }
            
            try {
                const resultMessage = await handleSendMessage(stepDescription, undefined, undefined, step.tool_to_use as TaskType, true, false);
                
                let outputData = resultMessage.content;
                if (resultMessage.functionResponse) outputData = JSON.stringify(resultMessage.functionResponse.response);
                if (!outputData && resultMessage.functionCalls?.length > 0) outputData = JSON.stringify(resultMessage.functionCalls[0].args);
                
                if (step.output_key) {
                    planState[step.output_key] = outputData;
                }

                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: outputData } });
            } catch (e: any) {
                const errorMessage = parseApiErrorMessage(e);
                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'failed', result: errorMessage } });
                
                // DYNAMIC RE-PLANNING
                const originalPlanMsg = state.messages.find(m => m.plan?.id === plan.id);
                const originalUserMsg = state.messages.find(m => m.id === String(parseInt(originalPlanMsg!.id) - 1));
                const originalUserGoal = originalUserMsg?.content || "the user's original goal";

                const replanPrompt = `[Task]: My plan execution failed.
[Original Goal]: ${originalUserGoal}
[Original Plan]: ${JSON.stringify(plan)}
[Failed Step]: Step ${step.step_id}: ${step.description}
[Error Message]: ${errorMessage}
[Instruction]: Generate a new, complete plan to achieve the original goal, taking this failure into account.`;
                
                await handleSendMessage(replanPrompt, undefined, undefined, TaskType.Planner, false, false);
                break; 
            }
        }
    
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: undefined, currentPlanStepId: undefined } });
    
    }, [handleSendMessage, dispatch, state.messages]);

    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);

    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan };
};