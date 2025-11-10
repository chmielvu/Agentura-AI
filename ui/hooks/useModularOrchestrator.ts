/**
 * Agentura AI (v2.5) - Modular Orchestrator Hook
 *
 * This hook is the core of the v2.3 refactor. It isolates all complex
 * agentic orchestration logic from the UI, providing a clean API to the
 * main App component. It manages state, PWC loops, tool calls, and retries.
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall, CritiqueResult, GroundingSource, SessionState, WorkflowState, WorkflowStepState } from '../../types';
import { APP_VERSION, TASK_CONFIGS, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL } from '../../constants';
import { extractSources, fileToGenerativePart } from './helpers';
import { agentGraphConfigs } from '../components/graphConfigs';

const initialSessionState: SessionState = {
    version: APP_VERSION,
    messages: [],
    agenticState: {},
};

export const useModularOrchestrator = (
    persona: Persona,
    pyodideRef: React.MutableRefObject<any>
) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const chatRef = useRef<(Chat & { _persona?: Persona, _taskType?: TaskType }) | null>(null);
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY as string }), []);
    const retryCountRef = useRef(0);

    // Load session from localStorage on init
    useEffect(() => {
        try {
            const saved = localStorage.getItem('agentic-session');
            if (saved) {
                const parsed = JSON.parse(saved) as SessionState;
                if (parsed.version === APP_VERSION) {
                    setMessages(parsed.messages);
                } else {
                    localStorage.removeItem('agentic-session');
                }
            }
        } catch (e) { 
            console.error("Failed to load session", e);
            localStorage.removeItem('agentic-session');
        }
    }, []);


    // Persist session to localStorage
    useEffect(() => {
        try {
            const sessionState: SessionState = { version: APP_VERSION, messages, agenticState: {} };
            localStorage.setItem('agentic-session', JSON.stringify(sessionState));
        } catch (e) { console.error("Failed to save messages", e); }
    }, [messages]);

    const updateWorkflowState = (messageId: string, nodeId: number, state: Partial<WorkflowStepState>) => {
        setMessages(prev => prev.map(msg => {
            if (msg.id === messageId && msg.workflowState) {
                const nodeKey = `node-${nodeId}`;
                const existingState = msg.workflowState[nodeKey] || {};
                const updatedState: WorkflowStepState = { ...existingState, ...state };
                if (state.status && existingState.status !== state.status) {
                    if (state.status === 'running') updatedState.startTime = Date.now();
                    if (['completed', 'failed'].includes(state.status)) updatedState.endTime = Date.now();
                }
                return {
                    ...msg,
                    workflowState: {
                        ...msg.workflowState,
                        [nodeKey]: updatedState
                    }
                };
            }
            return msg;
        }));
    };

    const runPythonCode = async (code: string): Promise<string> => {
        if (!pyodideRef.current) return "Error: Pyodide is not initialized.";
        try {
          pyodideRef.current.runPython(`import sys, io; sys.stdout = io.StringIO()`);
          const result = await pyodideRef.current.runPythonAsync(code);
          const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
          return stdout || result?.toString() || "Code executed without output.";
        } catch (err: any) { return `Error: ${err.message}`; }
    };

    const processStream = async (stream: AsyncGenerator<GenerateContentResponse>, assistantMessageId: string) => {
        let fullText = '', sources: GroundingSource[] = [], functionCalls: FunctionCall[] = [];
        for await (const chunk of stream) {
          if (chunk.text) fullText += chunk.text;
          if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls.map(fc => ({ id: `fc-${Date.now()}`, name: fc.name, args: fc.args })));
          const newSources = extractSources(chunk);
          sources = Array.from(new Map([...sources, ...newSources].map(s => [s.uri, s])).values());
          setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, content: fullText, sources, functionCalls } : msg));
        }
        return { fullText, sources, functionCalls };
    };

    const callCriticAgent = async (originalQuery: string, agentOutput: string, messageId: string, nodeId: number): Promise<CritiqueResult | null> => {
        const config = TASK_CONFIGS[TaskType.Critique];
        updateWorkflowState(messageId, nodeId, { status: 'running', details: "Evaluating agent's v1 output..." });
        
        try {
            const resp = await ai.models.generateContent({ model: config.model, contents: { parts: [{ text: `Query: ${originalQuery}\nOutput: ${agentOutput}` }] }, config: config.config });
            const result = JSON.parse(resp.text) as CritiqueResult;
            updateWorkflowState(messageId, nodeId, { status: 'completed', details: result });
            setMessages(p => p.map(m => m.id === messageId ? { ...m, critique: result } : m));
            return result;
        } catch (e) {
            updateWorkflowState(messageId, nodeId, { status: 'failed', details: e });
            return null;
        }
    };
    
    const callApoRefineAgent = async (original_prompt: string, failed_output: string, critique: string): Promise<string> => {
        const apoPrompt = `You are an Auto-Prompt Optimization (APO) Critic. Generate a new, superior prompt to fix a failed task. ORIGINAL PROMPT: ${original_prompt}, FAILED OUTPUT: ${failed_output}, CRITIQUE: ${critique}. Output *only* the new prompt.`;
        const response = await ai.models.generateContent({ model: 'gemini-2.5-pro', contents: { parts: [{ text: apoPrompt }] }});
        return response.text;
    };

    const executeToolCall = async (assistantMessageId: string, originalUserQuery: string, functionCalls: FunctionCall[]) => {
        let toolParts: Part[] = [];
        for (const call of functionCalls) {
            let responseContent: any = {};
            if (call.name === 'apo_refine') {
                const { original_prompt, failed_output, critique } = call.args;
                responseContent.content = await callApoRefineAgent(original_prompt, failed_output, critique);
            } else if (call.name === 'veo_tool' || call.name === 'musicfx_tool') {
                responseContent.content = `(Mock) ${call.name} initiated.`;
            } else {
                responseContent.content = `Tool call to '${call.name}' handled.`;
            }
            toolParts.push({ functionResponse: { name: call.name, response: responseContent } });
            setMessages(p => [...p, { id: Date.now().toString(), role: 'tool', functionResponse: { name: call.name, response: responseContent }, content: '' }]);
        }
        const stream = await chatRef.current!.sendMessageStream({ message: toolParts });
        await processStream(stream, assistantMessageId);
        setMessages(p => p.map(m => m.id === assistantMessageId ? { ...m, isLoading: false } : m));
    };

    const executeComplexPwcLoop = async (assistantMessageId: string, originalUserQuery: string, v1Output: string) => {
        updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: `V1 Output: ${v1Output.substring(0, 100)}...` });
        const critique = await callCriticAgent(originalUserQuery, v1Output, assistantMessageId, 3);
        const avgScore = critique ? (critique.scores.faithfulness + critique.scores.coherence + critique.scores.coverage) / 3 : 5;
        
        if (critique && avgScore < 4 && retryCountRef.current < 1) {
            retryCountRef.current++;
            updateWorkflowState(assistantMessageId, 4, { status: 'running', details: 'Critique score low. Retrying...' });
            const retryMsgId = Date.now().toString();
            setMessages(p => [...p, { id: retryMsgId, role: 'assistant', isLoading: true, content: '', taskType: TaskType.Retry }]);
            const retryPrompt = `Critique: ${critique.critique}. Retry query: ${originalUserQuery}`;
            const stream = await chatRef.current!.sendMessageStream({ message: [{ text: retryPrompt }] });
            await processStream(stream, retryMsgId);
            setMessages(p => p.map(m => m.id === retryMsgId ? { ...m, isLoading: false } : m));
        } else {
            updateWorkflowState(assistantMessageId, 4, { status: 'completed', details: 'Final answer synthesized.' });
        }
    };
    
    const continueCodePwcLoop = useCallback(async (codeOutput: string, assistantMessageId: string, originalUserQuery: string) => { /* ... */ }, [ai, messages]);
    
    const handleStreamEnd = (assistantMessageId: string, routedTask: TaskType, originalUserQuery: string, streamOutput: { fullText: string; functionCalls?: FunctionCall[] }) => {
        const { fullText, functionCalls } = streamOutput;
        if (routedTask === TaskType.Complex) {
            executeComplexPwcLoop(assistantMessageId, originalUserQuery, fullText);
        } else if (functionCalls && functionCalls.length > 0) {
            if (functionCalls.some(fc => fc.name === 'code_interpreter')) {
                updateWorkflowState(assistantMessageId, 2, { status: 'completed', details: 'Code generated. Awaiting execution.' });
                setMessages(p => p.map(m => m.id === assistantMessageId ? { ...m, isLoading: false, functionCalls: m.functionCalls?.map(fc => ({...fc, isAwaitingExecution: true})) } : m));
            } else {
                executeToolCall(assistantMessageId, originalUserQuery, functionCalls);
            }
        } else {
            updateWorkflowState(assistantMessageId, 2, { status: 'completed' });
            setIsLoading(false);
            setMessages(p => p.map(m => m.id === assistantMessageId ? { ...m, isLoading: false } : m));
        }
    };
    
    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => {
        if (isLoading) return;
        setIsLoading(true);
        retryCountRef.current = 0;
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file };
        const currentMessages = [...messages, userMsg];
        setMessages(currentMessages);
        
        const assistantMsgId = Date.now().toString();
        
        try {
            let routedTask = forcedTask;
            let initialWorkflow: WorkflowState = {};
            if (!routedTask) {
                // Router Step
                initialWorkflow['node-1'] = { status: 'running', startTime: Date.now(), details: 'Routing user query...' };
                setMessages(p => [...p, { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, workflowState: initialWorkflow }]);
                const routerHistory = currentMessages.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
                const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                routedTask = routerResp.functionCalls?.[0]?.args.route as TaskType || TaskType.Chat;
            }
            if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
            
            // Initialize workflow for the routed task
            const graphConfig = agentGraphConfigs[routedTask];
            const workflowState: WorkflowState = {};
            if (graphConfig) {
                graphConfig.nodes.forEach(node => {
                    workflowState[`node-${node.id}`] = { status: 'pending' };
                });
            }
            workflowState['node-1'] = { status: 'completed', endTime: Date.now(), details: `Routed to ${routedTask}` };
            workflowState['node-2'] = { status: 'running', startTime: Date.now() };

            setMessages(p => p.map(m => m.id === assistantMsgId ? { ...m, taskType: routedTask, workflowState } : p.some(pm => pm.id === assistantMsgId) ? m : [...p, { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: routedTask, workflowState }]));


            const taskConfig = TASK_CONFIGS[routedTask];
            const personaInstruction = PERSONA_CONFIGS[persona].instruction;
            const systemInstruction = [personaInstruction, taskConfig.config?.systemInstruction?.parts[0]?.text].filter(Boolean).join('\n\n');
            
            const history: Content[] = currentMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{text: m.content}] }));

            chatRef.current = ai.chats.create({ model: taskConfig.model, config: { ...taskConfig.config, ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }) }, history }) as any;
            chatRef.current._taskType = routedTask;
            chatRef.current._persona = persona;
            
            const parts: Part[] = [{ text: prompt }];
            if (file) parts.push(fileToGenerativePart(file));
            const stream = await chatRef.current.sendMessageStream({ message: parts });
            const streamOutput = await processStream(stream, assistantMsgId);
            // FIX: The handleStreamEnd function was called with the wrong number of arguments. Added assistantMsgId.
            handleStreamEnd(assistantMsgId, routedTask, prompt, streamOutput);

        } catch(e: any) {
            setIsLoading(false);
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
            setMessages(p => p.map(m => m.id === assistantMsgId ? { ...m, isLoading: false, content: errorMessage } : m));
        }
    }, [isLoading, ai, persona, messages]);
    
    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string, codeOverride?: string) => {
        const msg = messages.find(m => m.id === messageId);
        const fc = msg?.functionCalls?.find(f => f.id === functionCallId);
        if (!msg || !fc) return;

        updateWorkflowState(messageId, 3, { status: 'running', details: "Executing Python code..." });

        const codeToRun = codeOverride ?? fc.args.code;
        const result = await runPythonCode(codeToRun);
        
        updateWorkflowState(messageId, 3, { status: 'completed', details: `Output: ${result}` });
        updateWorkflowState(messageId, 4, { status: 'running' });

        // This would be where you continue the PWC loop by sending result back
        const originalUserQuery = messages.find(m => m.role === 'user')?.content || '';
        await continueCodePwcLoop(result, messageId, originalUserQuery);
        
    }, [messages, runPythonCode]);
    
    const updatePlanStepStatus = (planId: string, stepId: number, status: PlanStep['status'], result?: string) => {
        setMessages(prev => prev.map(msg => {
            if (msg.plan?.id === planId) {
                const newPlan = { ...msg.plan, plan: msg.plan.plan.map(step => 
                    step.step_id === stepId ? { ...step, status, result } : step
                )};
                return { ...msg, plan: newPlan };
            }
            return msg;
        }));
    };

    const handleExecutePlan = useCallback(async (plan: Plan) => {
        setIsLoading(true);
        for (const step of plan.plan.sort((a,b) => a.step_id - b.step_id)) {
            updatePlanStepStatus(plan.id, step.step_id, 'in-progress');
            await handleSendMessage(step.description, undefined, undefined, step.tool_to_use as TaskType);
            updatePlanStepStatus(plan.id, step.step_id, 'completed', 'Step executed successfully.');
        }
        setIsLoading(false);
    }, [handleSendMessage]);

    return { messages, setMessages, isLoading, handleSendMessage, handleExecuteCode, handleExecutePlan };
};
