
import React, { useReducer, useCallback, useMemo, useEffect, useRef, useState } from 'react'; 
import { GoogleGenAI, Chat, Part, GenerateContentResponse, Content } from '@google/genai';
import {
  ChatMessage, TaskType, FileData, Persona, Plan, PlanStep, FunctionCall,
  CritiqueResult, GroundingSource, AgenticState, WorkflowState, WorkflowStepState, SwarmMode,
  VizSpec, RagSource, ReflexionEntry,
  GraphState, GraphNode
} from '../../types';
import {
  APP_VERSION, AGENT_ROSTER, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION,
  ROUTER_TOOL, SOTA_SECURITY_PIPELINE, CRITIQUE_TOOL, RERANKER_TOOL,
  VERIFIER_TOOL,
  SUPERVISOR_ROUTER_TOOL,
  SUPERVISOR_SYSTEM_INSTRUCTION
} from '../../constants';
import { extractSources, fileToGenerativePart } from './helpers';
import { agentGraphConfigs } from '../components/graphConfigs';
import { useDB, DocChunk } from './useDB';
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

// This is the new "Supervisor Loop"
const runGraph = async (
  state: GraphState,
  dispatch: React.Dispatch<Action>,
  helpers: {
    handleSendMessageInternal: (prompt: string, file: FileData | undefined, repoUrl: string | undefined, forcedTask: TaskType, isGraphStep: boolean, manageLoadingState: boolean, onStreamUpdate?: (streamedText: string) => void) => Promise<ChatMessage>,
    getChat: (taskType: TaskType, history?: ChatMessage[]) => Chat,
    processStream: (stream: AsyncGenerator<GenerateContentResponse>, assistantMessageId: string, onStreamUpdate?: (streamedText: string) => void) => Promise<{ fullText: string; sources: GroundingSource[]; functionCalls: FunctionCall[]; }>,
    // FIX: Update type for findSimilar to include similarity score.
    findSimilar: (queryVector: number[], topK?: number, sourceFilter?: string) => Promise<(DocChunk & { similarity: number })[]>,
    generateEmbedding: (text: string) => Promise<number[]>,
    addReflexionEntry: (entry: ReflexionEntry) => Promise<any>,
  }
) => {
  const { handleSendMessageInternal, addReflexionEntry, generateEmbedding, findSimilar } = helpers;

  const updateGraphHistory = (report: string) => {
    state.history.push({ id: `graph-step-${Date.now()}`, role: 'assistant', content: report, taskType: TaskType.Supervisor });
    dispatch({
      type: 'UPDATE_ASSISTANT_MESSAGE',
      payload: { messageId: state.id, update: { supervisorReport: state.history.map(m => m.content).join('\n') } }
    });
  };

  while (state.nextAgent !== 'A_FINAL') {
    const currentNode = state.nextAgent as TaskType; // We know it's not A_FINAL
    let agentResponse: ChatMessage | null = null;
    let fileData: FileData | undefined = state.history.find(m => m.role === 'user')?.file;

    try {
      updateGraphHistory(`\n---▶ Supervisor: Calling \`${currentNode}\`...`);
      const stateJson = JSON.stringify(state, null, 2);

      // 1. --- EXECUTE NODE ---
      switch (currentNode) {
        case TaskType.Router: {
          const routerPrompt = `Original Prompt: ${state.originalPrompt}`;
          agentResponse = await handleSendMessageInternal(routerPrompt, fileData, undefined, TaskType.Router, true, false);
          const route = agentResponse.functionCalls?.find(fc => fc.name === ROUTER_TOOL.name)?.args.route;
          state.lastOutput = route || TaskType.Chat;
          updateGraphHistory(`Router output: ${state.lastOutput}`);
          break;
        }

        case TaskType.Planner: {
          const plannerPrompt = AGENT_ROSTER[TaskType.Planner].systemInstruction.replace('{graph_state_json}', stateJson).replace('{past_lessons}', "N/A"); // TODO: Add lesson lookup
          agentResponse = await handleSendMessageInternal(plannerPrompt, fileData, undefined, TaskType.Planner, true, false);
          const planCall = agentResponse.functionCalls?.find(fc => fc.name === 'submit_plan');
          if (!planCall || !planCall.args.plan) throw new Error("Planner failed to return a valid plan.");
          state.plan = { id: `plan-${state.id}`, plan: planCall.args.plan.map((step: any) => ({ ...step, status: 'pending' })) };
          state.lastOutput = state.plan;
          dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: state.id, update: { plan: state.plan } } });
          updateGraphHistory(`Planner output: Plan with ${state.plan.plan.length} steps.`);
          break;
        }
        
        case TaskType.Research:
        case TaskType.Code:
        case TaskType.Creative:
        case TaskType.DataAnalyst:
        case TaskType.Maintenance:
        case TaskType.Meta:
        case TaskType.Complex: {
          const step = state.plan?.plan.find(s => s.tool_to_use === currentNode && s.status === 'pending');
          if (!step) throw new Error(`Supervisor tried to call ${currentNode}, but no pending step was found in the plan.`);
          
          dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: state.plan!.id, stepId: step.step_id, status: 'in-progress', result: 'Executing...' } });
          
          agentResponse = await handleSendMessageInternal(step.description, fileData, undefined, currentNode, true, false, (streamedText) => {
             dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: state.plan!.id, stepId: step.step_id, status: 'in-progress', result: streamedText + ' |'} });
          });
          
          let stepResult = agentResponse.content;
          
          // Handle RAG tool call
          const agenticRagCall = agentResponse.functionCalls?.find(fc => fc.name === 'autonomous_rag_tool');
          if (agenticRagCall) {
              const queryVector = await generateEmbedding(agenticRagCall.args.query);
              const similarChunks = await findSimilar(queryVector, 5);
              stepResult = JSON.stringify(similarChunks.map(c => ({ documentName: c.source, chunkContent: c.text, similarityScore: c.similarity })));
          }

          // Handle Data Analyst tool call
          if (currentNode === TaskType.DataAnalyst) {
                const vizCall = agentResponse.functionCalls?.find(fc => fc.name === 'submit_visualization_spec');
                if (!vizCall) { throw new Error("DataAnalyst agent failed to call 'submit_visualization_spec' tool."); }
                dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: state.id, update: { vizSpec: vizCall.args as VizSpec } } });
                stepResult = "Visualization Spec Generated.";
          }

          state.lastOutput = stepResult;
          dispatch({ type: 'UPDATE_PLAN_STEP', payload: { planId: state.plan!.id, stepId: step.step_id, status: 'completed', result: stepResult } });
          updateGraphHistory(`${currentNode} output: ${stepResult.substring(0, 100)}...`);
          break;
        }
        
        case TaskType.Critique: {
            const critiquePrompt = `Critique the last output based on the original goal. \n[Original Goal]: ${state.originalPrompt}\n[Last Failed Output]: ${JSON.stringify(state.lastOutput, null, 2)}`;
            agentResponse = await handleSendMessageInternal(critiquePrompt, fileData, undefined, TaskType.Critique, true, false);
            const critiqueCall = agentResponse.functionCalls?.find(fc => fc.name === CRITIQUE_TOOL.name);
            if (!critiqueCall) throw new Error("Critique agent failed to provide a valid critique.");
            state.lastOutput = critiqueCall.args; // The critique object
            
            // Save this as a lesson
            try {
                const promptEmbedding = await generateEmbedding(state.originalPrompt);
                await addReflexionEntry({ 
                    promptEmbedding, 
                    original_prompt: state.originalPrompt, 
                    failed_output: JSON.stringify(state.lastOutput), 
                    critique: critiqueCall.args.critique, 
                    successful_fix: "N/A (Pending Re-Plan)" 
                });
            } catch (e) { console.error("Failed to save reflexion memory:", e); }
            
            updateGraphHistory(`Critique output: ${critiqueCall.args.critique}`);
            break;
        }

        default:
          // Fallback for simple agents (like Chat, Vision)
          agentResponse = await handleSendMessageInternal(state.originalPrompt, fileData, undefined, currentNode, true, false);
          state.lastOutput = agentResponse.content;
          updateGraphHistory(`${currentNode} output: ${agentResponse.content.substring(0, 100)}...`);
      }

    } catch (e: any) {
      const errorMsg = parseApiErrorMessage(e);
      updateGraphHistory(`\n---❌ ERROR in \`${currentNode}\`: ${errorMsg}`);
      state.error = errorMsg;
      state.lastOutput = { error: errorMsg, agent: currentNode };
      // On error, we still call the Supervisor to decide what to do (e.g., retry, critique)
    }

    // 2. --- CALL SUPERVISOR TO DECIDE NEXT STEP ---
    const supervisorPrompt = SUPERVISOR_SYSTEM_INSTRUCTION.replace('{graph_state_json}', JSON.stringify(state, null, 2));
    const supervisorMsg = await handleSendMessageInternal(supervisorPrompt, undefined, undefined, TaskType.Supervisor, true, false);
    const routeCall = supervisorMsg.functionCalls?.find(fc => fc.name === SUPERVISOR_ROUTER_TOOL.name);

    if (!routeCall) {
      updateGraphHistory(`\n---🛑 FATAL ERROR: Supervisor failed to route. Halting graph.`);
      state.nextAgent = 'A_FINAL'; // Halt loop
      state.lastOutput = "FATAL ERROR: Supervisor failed to provide a valid route.";
    } else {
      state.nextAgent = routeCall.args.agent_to_call as GraphNode;
      updateGraphHistory(`Supervisor decision: Route to \`${state.nextAgent}\`. Reason: ${routeCall.args.reasoning}`);
    }
  }

  // Loop finished
  updateGraphHistory(`\n---✅ Graph complete. Final output generated.`);
  return state.lastOutput;
};

export const useModularOrchestrator = (
    persona: Persona,
    swarmMode: SwarmMode, // We keep this for UI / agent filtering
    activeRoster: TaskType[],
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

    const handleApiError = useCallback((e: any, assistantMessageId: string, manageLoadingState: boolean) => {
        const errorMessage = parseApiErrorMessage(e);
        dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMessageId, update: { isLoading: false, content: errorMessage } } });
        if (manageLoadingState) dispatch({ type: 'SET_LOADING', payload: false });
        throw e;
    }, [dispatch]);
    
    const getChat = useCallback((taskType: TaskType, history: ChatMessage[] = []): Chat => {
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
            config: { ...agentConfig.config, tools: agentConfig.tools, ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }) },
            history: history.map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{text: m.content}] }))
        });
    }, [ai, persona, sessionFeedback]);

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
    
    const handleSendMessageInternal = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType, isGraphStep: boolean = false, manageLoadingState: boolean = true, onStreamUpdate?: (streamedText: string) => void): Promise<ChatMessage> => {
        return new Promise(async (resolve, reject) => {
            const assistantMsgId = isGraphStep ? `step-${Date.now()}-${Math.random()}` : Date.now().toString();
            let routedTask = forcedTask;
            
            try {
                if (!routedTask) {
                    // This block is now legacy, but kept for safety.
                    const assistantMsg: ChatMessage = { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat };
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });
                    const routerHistory = state.messages.slice(-5).map(m => ({ role: m.role === 'user' ? 'user' as const : 'model' as const, parts: [{ text: m.content }] }));
                    const routerResp = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: [...routerHistory, { role: 'user', parts: [{ text: prompt }] }], config: { systemInstruction: { parts: [{ text: ROUTER_SYSTEM_INSTRUCTION }] }, tools: [{ functionDeclarations: [ROUTER_TOOL] }] }});
                    const proposedRoute = routerResp.functionCalls?.[0]?.args.route as TaskType | undefined;
                    routedTask = proposedRoute && AGENT_ROSTER.hasOwnProperty(proposedRoute) ? proposedRoute : TaskType.Chat;
                } else if (!isGraphStep) {
                    dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: { id: assistantMsgId, role: 'assistant', content: '', isLoading: true, taskType: routedTask } } });
                }

                if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
                
                const agentConfig = AGENT_ROSTER[routedTask!];
                if (!agentConfig) {
                    throw new Error(`Unknown agent task: ${routedTask}`);
                }
                
                if(!isGraphStep) dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: { taskType: routedTask } } });
                
                const chat = getChat(routedTask!, state.messages);
                const parts: Part[] = [{ text: prompt }];
                if (file) parts.push(fileToGenerativePart(file));
                const stream = await chat.sendMessageStream({ message: { role: 'user', parts } });
                const streamOutput = await processStream(stream, assistantMsgId, onStreamUpdate);
                
                let vizSpec: VizSpec | undefined = undefined;
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
                if (!isGraphStep) { // Only update final message if not a graph step
                    dispatch({ type: 'UPDATE_ASSISTANT_MESSAGE', payload: { messageId: assistantMsgId, update: finalMessage } });
                }
                resolve(finalMessage);

            } catch(e) { handleApiError(e, assistantMsgId, manageLoadingState); reject(e); }
        });
    }, [state.messages, ai, persona, processStream, dispatch, handleApiError, getChat, sessionFeedback]);

    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => {
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: prompt, file, repo: repoUrl ? { url: repoUrl, owner: '', repo: '' } : undefined };
        dispatch({ type: 'SEND_MESSAGE_START', payload: { userMessage: userMsg } });
        
        const assistantMsgId = (parseInt(userMsg.id) + 1).toString();
        const assistantMsg: ChatMessage = { 
        id: assistantMsgId, 
        role: 'assistant', 
        content: 'Supervisor: Initializing graph...', 
        isLoading: true, 
        taskType: TaskType.Supervisor,
        supervisorReport: 'Supervisor: Initializing graph...'
        };
        dispatch({ type: 'ADD_ASSISTANT_MESSAGE', payload: { assistantMessage: assistantMsg } });

        let sourceFilter: string | undefined = undefined;
        if (prompt.startsWith('/manualrag')) {
            const match = prompt.match(/\/manualrag\s+([^\s]+)/);
            if (match && match[1]) {
                sourceFilter = match[1];
                prompt = prompt.replace(match[0], '').trim();
            }
        }

        const findSimilarWithFilter = (queryVector: number[], topK = 5) => {
            return findSimilar(queryVector, topK, sourceFilter);
        };

        const initialState: GraphState = {
        id: assistantMsgId,
        originalPrompt: prompt,
        plan: null,
        history: [userMsg],
        lastOutput: null,
        nextAgent: forcedTask || TaskType.Router, 
        error: null,
        };

        const graphHelpers = {
            handleSendMessageInternal,
            getChat,
            processStream,
            findSimilar: findSimilarWithFilter,
            generateEmbedding,
            addReflexionEntry,
        };

        try {
            const finalOutput = await runGraph(initialState, dispatch, graphHelpers);

            dispatch({ 
                type: 'UPDATE_ASSISTANT_MESSAGE', 
                payload: { 
                messageId: assistantMsgId, 
                update: { 
                    content: (typeof finalOutput === 'string' || !finalOutput) ? (finalOutput || "Graph complete.") : JSON.stringify(finalOutput, null, 2), 
                    isLoading: false 
                } 
                } 
            });

        } catch (e) {
            const errorMsg = parseApiErrorMessage(e);
            dispatch({ 
                type: 'UPDATE_ASSISTANT_MESSAGE', 
                payload: { 
                messageId: assistantMsgId, 
                content: `Graph execution failed: ${errorMsg}`, 
                isLoading: false 
                } 
            });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }

    }, [swarmMode, activeRoster, handleSendMessageInternal, dispatch, addReflexionEntry, findSimilarReflexions, generateEmbedding, getChat, processStream, findSimilar]);

    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string, codeOverride?: string) => {
        console.log("handleExecuteCode called (currently handled in plan execution)", messageId, functionCallId);
    }, []);

    const handleExecutePlan = async (plan: Plan, trace: any[]): Promise<string> => {
      console.log("handleExecutePlan is deprecated and now handled by the Supervisor graph.");
      return "This function is deprecated.";
    };
    
    const setMessages = useCallback((messages: ChatMessage[]) => {
        dispatch({ type: 'SET_MESSAGES', payload: messages });
    }, [dispatch]);
    
    const INTERNAL_AGENTS = [TaskType.Reranker, TaskType.Embedder, TaskType.Verifier, TaskType.Retry];


    return { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan, addSessionFeedback };
};