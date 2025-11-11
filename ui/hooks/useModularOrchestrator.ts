/**
 * Agentura AI (v3.0) - Modular Orchestrator Hook (High-Intelligence Normal Mode)
 *
 * This version modifies the routing logic to allow all non-destructive agentic
 * capabilities (Code, Complex, Creative, Research) in Normal Mode, while strictly
 * blocking only the Planner (app modification/deployment logic).
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
                // NOTE: Using a fixed model 'gemini-2.5-flash' for the critic for cost/speed efficiency
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
                // NOTE: Use the current model's chat history for the retry agent communication
                const stream = await chat.sendMessageStream({ message: [{ text: retryPrompt }] });
                await processStream(stream, retryMsgId);
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: retryMsgId, update: { isLoading: false } } });
                updateWorkflowState(assistantMessageId, 4, { status: 'completed', details: { reason: 'Handed off to Retry agent.', critique } });
            } else {
                updateWorkflowState(assistantMessageId, 4, { status: 'completed', details: { reason: 'Final answer synthesized.', ...(critique && { critique: critique }) } });
            }
        };

        // ENHANCEMENT: Route Research to the PWC loop to enable the CRAG workflow
        if (routedTask === TaskType.Complex || routedTask === TaskType.Research) {
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
            if (repoUrl) {
                const match = repoUrl.match(/https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/);
                if (match) {
                    userMsg.repo = {
                        url: repoUrl,
                        owner: match[1],
                        repo: match[2],
                    };
                }
            }
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

                // ADAPTIVE ROUTING: Use gemini-2.5-flash for speed/cost (Lite Tier proxy)
                const routerHistory = fullHistory.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
                const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                routedTask = routerResp.functionCalls?.[0]?.args.route as TaskType || TaskType.Chat;
            } else {
                const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: `Executing: ${prompt}`, isLoading: true, taskType: routedTask };
                dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
            }

            if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
            
            // CRITICAL ARCHITECTURAL HOOK: Block destructive tasks in Normal Mode
            if (mode === ChatMode.Normal) {
                // Only TaskType.Planner is considered destructive (multi-step app logic/editing).
                if (routedTask === TaskType.Planner) {
                    routedTask = TaskType.Chat; // Downgrade destructive task

                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { content: `**Mode Constraint:** Task routed to *Chat* mode. Planning and application file modification (vibe coding) are disabled. To use these features, switch to **Developer** mode in the header.`, isLoading: false } } });
                    if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
                    return; // EXIT EXECUTION
                }
                // NOTE: TaskType.Code is now allowed to pass, as its action is non-destructive sandboxed execution (PoT).
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
            handleApiError(e, assistantMsgId, manageLoadingState);
        }
    }, [state.isLoading, state.messages, ai, persona, handleStreamEnd, processStream, dispatch, mode, handleApiError]); // ADD handleApiError to dependencies

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
    
        // **FURTHER ENHANCEMENT: Smart Retry Logic**
        // Filter to find only the steps that need to be run (pending or failed).
        const stepsToExecute = plan.plan
            .filter(step => step.status === 'pending' || step.status === 'failed')
            .sort((a, b) => a.step_id - b.step_id);
    
        for (const step of stepsToExecute) {
            dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'in-progress' } });
            try {
                // Execute the step. This function will throw on API error.
                await handleSendMessage(step.description, undefined, undefined, step.tool_to_use as TaskType, true, false);
                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'completed', result: 'Step executed successfully.' } });
            } catch (e: any) {
                // ENHANCEMENT: Use the new parseApiErrorMessage function for consistent error reporting in plans
                const errorMessage = parseApiErrorMessage(e);
                dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: plan.id, stepId: step.step_id, status: 'failed', result: errorMessage } });
                console.error(`Plan step ${step.step_id} failed:`, e);
                
                // **CRITICAL:** Stop plan execution on the first failure.
                // This prevents subsequent steps from running without their dependencies.
                break; 
            }
        }
    
        dispatch({ type: 'SET_LOADING', payload: false });
        dispatch({ type: 'SET_AGENTIC_STATE', payload: { activePlanId: undefined, currentPlanStepId: undefined } });
    
    }, [handleSendMessage, dispatch]);

    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);

    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan };
};