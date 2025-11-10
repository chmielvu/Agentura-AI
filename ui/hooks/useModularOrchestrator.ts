/**
 * Agentura AI (v2.6) - Modular Orchestrator Hook (useReducer Refactor)
 *
 * This hook is the core of the v2.5 refactor. It isolates all complex
 * agentic orchestration logic from the UI, providing a clean API to the 
 * main App component. It manages state, PWC loops, tool calls, and retries
 * through a centralized reducer for robust and persistent state management.
 */
import React, { useReducer, useCallback, useMemo, useEffect, useRef } from 'react'; 
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall, CritiqueResult, GroundingSource, AgenticState, WorkflowState, WorkflowStepState, ChatMode } from '../../types';
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

    const runPythonCode = async (code: string): Promise<string> => {
        if (!pyodideRef.current) return "Error: Pyodide is not initialized.";
        try {
          pyodideRef.current.runPython(`import sys, io; sys.stdout = io.StringIO()`);
          const result = await pyodideRef.current.runPythonAsync(code);
          const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
          return stdout || result?.toString() || "Code executed without output.";
        } catch (err: any) { return `Error: ${err.message}`; }
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
    
    const continueCodePwcLoop = useCallback(async (codeOutput: string, assistantMessageId: string, originalUserQuery: string) => { /* ... */ }, [ai, state.messages]);

    const handleStreamEnd = useCallback(async (chat: Chat, assistantMessageId: string, routedTask: TaskType, originalUserQuery: string, streamOutput: { fullText: string; functionCalls?: FunctionCall[] }, manageLoadingState: boolean) => {
        const { fullText, functionCalls } = streamOutput;

        const executeComplexPwcLoop = async (v1Output: string) => {
            updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: { v1_output: v1Output } });
            
            updateWorkflowState(assistantMessageId, 3, { status: 'running', details: { input_for_critique: `Query: ${originalUserQuery}\n\nOutput (first 500 chars): ${v1Output.substring(0, 500)}...` } });
            const criticConfig = TASK_CONFIGS[TaskType.Critique];
            let critique: CritiqueResult | null = null;
            try {
                const resp = await ai.models.generateContent({ model: criticConfig.model, contents: { parts: [{ text: `Query: ${originalUserQuery}\nOutput: ${v1Output}` }] }, config: criticConfig.config });
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
            }
        };

        if (routedTask === TaskType.Complex) {
            await executeComplexPwcLoop(fullText);
        } else if (functionCalls && functionCalls.length > 0) {
            if (functionCalls.some(fc => fc.name === 'code_interpreter')) {
                // This is Program-of-Thought (PoT) - allows Code execution in both modes
                updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: { function_calls: functionCalls } });
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false, functionCalls: functionCalls.map(fc => ({...fc, isAwaitingExecution: true})) } } });
            } else {
                // Mock tool execution for other tools (Veo, MusicFX)
                let toolParts: Part[] = [];
                for (const call of functionCalls) {
                    let responseContent: any = { content: `(Mock) Tool call to '${call.name}' handled.` };
                    toolParts.push({ functionResponse: { name: call.name, response: responseContent } });
                    const toolMsg: ChatMessage = { id: Date.now().toString(), role: 'tool', functionResponse: { name: call.name, response: responseContent }, content: '' };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: toolMsg } });
                }
                const stream = await chat.sendMessageStream({ message: toolParts });
                await processStream(stream, assistantMessageId);
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false } } });
            }
        } else {
            // This includes Planner/Code tasks that were downgraded to Chat in Normal Mode
            updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: { output: fullText } });
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false } } });
            if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
        }
    }, [ai, updateWorkflowState, processStream, dispatch]);
    
    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isPlanStep: boolean = false, manageLoadingState: boolean = true) => {
        if (state.isLoading && manageLoadingState) return;
        
        retryCountRef.current = 0;
        
        if (manageLoadingState) {
            const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file };
            dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: userMsg } });
        }
        
        const assistantMsgId = Date.now().toString();
        const fullHistory = [...state.messages];

        try {
            let routedTask = forcedTask;

            if (!routedTask) {
                const initialWorkflow: WorkflowState = { 'node-1': { status: 'running', startTime: Date.now(), details: 'Routing user query...' } };
                const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, workflowState: initialWorkflow };
                dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });

                // ADAPTIVE ROUTING: Use gemini-2.5-flash for speed/cost
                const routerHistory = fullHistory.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
                const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                routedTask = routerResp.functionCalls?.[0]?.args.route as TaskType || TaskType.Chat;
            } else {
                const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: `Executing: ${prompt}`, isLoading: true, taskType: routedTask };
                dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
            }

            if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
            
            // CRITICAL ARCHITECTURAL HOOK: Block Code/Planner tasks for app modification in Normal Mode
            if (mode === ChatMode.Normal) {
                // If the user attempts to run a Code or Planner task in Normal Mode, force it to Chat.
                if (routedTask === TaskType.Code || routedTask === TaskType.Planner) {
                    routedTask = TaskType.Chat;

                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: `**Mode Constraint:** Task routed to *Chat* mode. To perform code generation, planning, or app file modification, please switch to **Developer** mode in the header.`, isLoading: false } } });
                    if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
                    return; // EXIT EXECUTION
                }
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

        } catch(e: any) {
            let errorMessage = "An unknown error occurred.";
            if (e?.message) {
                 if (e.message.includes('401') || e.message.includes('403') || e.message.includes('API key not valid')) {
                    errorMessage = "Authentication Error. Please ensure your API Key is valid.";
                } else if (e.message.includes('429')) {
                    errorMessage = "API quota exceeded. Please wait and try again later.";
                } else if (e.message.includes('SAFETY')) {
                    errorMessage = "The response was blocked by the safety filter due to potential policy violations.";
                } else {
                    errorMessage = `Error: ${e.message}`;
                }
            }
            dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { isLoading: false, content: errorMessage } } });
            if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
            throw e; // Re-throw for plan execution to catch
        }
    }, [state.isLoading, state.messages, ai, persona, handleStreamEnd, processStream, dispatch, mode]); // ADD mode to dependencies

    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string, codeOverride?: string) => {
        const msg = state.messages.find(m => m.id === messageId);
        const fc = msg?.functionCalls?.find(f => f.id === functionCallId);
        if (!msg || !fc) return;

        const codeToRun = codeOverride ?? fc.args.code;
        updateWorkflowState(messageId, 3, { status: 'running', details: { code_to_run: codeToRun } });

        const result = await runPythonCode(codeToRun);
        
        updateWorkflowState(messageId, 3, { status: 'completed', details: { code_to_run: codeToRun, output: result } });
        updateWorkflowState(messageId, 4, { status: 'running' });

        const originalUserQuery = state.messages.find(m => m.role === 'user')?.content || '';
        await continueCodePwcLoop(result, messageId, originalUserQuery);
        
    }, [state.messages, runPythonCode, updateWorkflowState, continueCodePwcLoop]);
    
    const handleExecutePlan = useCallback(async (plan: Plan) => {
        dispatch({ type: 'SET_LOADING', payload: true });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: plan.id } });

        const executionPromises = plan.plan
            .sort((a, b) => a.step_id - b.step_id)
            .map(async (step) => {
                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress' } });
                try {
                    await handleSendMessage(step.description, undefined, undefined, step.tool_to_use as TaskType, true, false);
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: 'Step executed successfully.' } });
                } catch (e: any) {
                    dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'failed', result: e.message || 'Step failed to execute.' } });
                    console.error(`Plan step ${step.step_id} failed:`, e);
                }
            });

        await Promise.all(executionPromises);

        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: undefined, currentPlanStepId: undefined } });

    }, [handleSendMessage, dispatch]);

    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);

    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan };
};
