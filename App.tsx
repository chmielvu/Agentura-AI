import React, { useState, useEffect, useRef } from 'react';
import { Persona, SwarmMode, TaskType, WorkflowState, ChatMessage } from './types';
import { useModularOrchestrator } from './ui/hooks/useModularOrchestrator';
import { Header } from './ui/components/Header';
import { Message } from './ui/components/Message';
import { ChatInput } from './ui/components/ChatInput';
import DebuggerModal from './components/Debugger';
import { agentGraphConfigs } from './ui/components/graphConfigs';
import { ContextPanel } from './ui/components/ContextPanel';
import { AGENT_ROSTER } from './constants';
import { FeedbackModal } from './ui/components/FeedbackModal';

const getInitialSwarmMode = () => (localStorage.getItem('agentic-swarm-mode') as SwarmMode) || SwarmMode.InformalCollaborators;

const App: React.FC = () => {
  const [persona, setPersona] = useState<Persona>(() => (localStorage.getItem('agentic-chat-persona') as Persona) || Persona.Default);
  const [swarmMode, setSwarmMode] = useState<SwarmMode>(getInitialSwarmMode);
  const [activeRoster, setActiveRoster] = useState<TaskType[]>(Object.values(TaskType));
  
  const pyodideRef = useRef<any>(null);
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const [debugSession, setDebugSession] = useState<{ code: string; onComplete: (output: string) => void; } | null>(null);
  
  const { state, setMessages, handleSendMessage, handleExecuteCode, handleExecutePlan, addSessionFeedback } = useModularOrchestrator(persona, swarmMode, activeRoster, pyodideRef);
  const { messages, isLoading } = state;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [lastGraphableTask, setLastGraphableTask] = useState<{ taskType: TaskType; workflowState: WorkflowState } | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{ msgId: string, taskType: TaskType } | null>(null);


  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages, isLoading]);
  useEffect(() => localStorage.setItem('agentic-chat-persona', persona), [persona]);
  useEffect(() => localStorage.setItem('agentic-swarm-mode', swarmMode), [swarmMode]);

  useEffect(() => {
    const lastTaskWithMessage = [...messages]
        .reverse()
        .find(m => m.role === 'assistant' && m.taskType && m.workflowState && agentGraphConfigs[m.taskType]);
    
    if (lastTaskWithMessage) {
        setLastGraphableTask({
            taskType: lastTaskWithMessage.taskType as TaskType,
            workflowState: lastTaskWithMessage.workflowState as WorkflowState,
        });
    }
  }, [messages]);

  useEffect(() => {
    async function load() {
      try {
        const pyodide = await (window as any).loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/' });
        pyodideRef.current = pyodide;
        setIsPyodideReady(true);
      } catch (e) { console.error("Pyodide loading failed:", e); }
    }
    load();
  }, []);

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
  
  const handleDebugCode = (messageId: string, functionCallId: string) => {
    const msg = messages.find(m => m.id === messageId);
    const fc = msg?.functionCalls?.find(f => f.id === functionCallId);
    if (!msg || !fc || !pyodideRef.current) return;
    
    setDebugSession({
      code: fc.args.code,
      onComplete: (output: string) => {
        handleExecuteCode(messageId, functionCallId, output);
        setDebugSession(null);
      },
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground font-mono">
      {debugSession && (
        <DebuggerModal {...debugSession} pyodide={pyodideRef.current} onClose={() => setDebugSession(null)} />
      )}
      {feedbackModal && (
          <FeedbackModal
              taskType={feedbackModal.taskType}
              onClose={() => setFeedbackModal(null)}
              onSubmit={(feedback) => {
                  if (feedbackModal.taskType) {
                      addSessionFeedback(feedbackModal.taskType, feedback);
                  }
                  setFeedbackModal(null);
              }}
          />
      )}
      <Header
        persona={persona}
        onPersonaChange={handlePersonaChange}
        swarmMode={swarmMode}
        onSwarmModeChange={handleSwarmModeChange}
        isLoading={isLoading}
        isPyodideReady={isPyodideReady}
        messages={messages}
      />
      
      <div className="flex-1 flex flex-row overflow-hidden">
        <aside className="w-[350px] flex-shrink-0 border-r border-border">
          <ContextPanel 
            swarmMode={swarmMode}
            activeRoster={activeRoster}
            onRosterChange={setActiveRoster}
            lastTask={lastGraphableTask}
          />
        </aside>

        <div className="flex-1 flex flex-col">
            <main className="flex-1 overflow-y-auto p-4 flex flex-col">
                {messages.length === 0 && !isLoading ? (
                    <div className="h-full flex flex-col justify-center items-center text-center text-foreground/70">
                        <h2 className="text-2xl font-semibold mb-2 font-sans">Agentura AI</h2>
                        <p className="text-sm">A specialized agent swarm. State your objective.</p>
                    </div>
                ) : (
                    <>
                    {messages.map((msg) => (
                        <Message
                            key={msg.id}
                            message={msg}
                            onExecuteCode={(msgId, fcId) => handleExecuteCode(msgId, fcId)}
                            onDebugCode={handleDebugCode}
                            onExecutePlan={(plan) => handleExecutePlan(plan, [])}
                            onRetryPlan={(plan) => handleExecutePlan(plan, [])}
                            onRequestFeedback={(msgId, taskType) => setFeedbackModal({ msgId, taskType })}
                        />
                    ))}
                    <div ref={messagesEndRef} />
                    </>
                )}
            </main>
            
            <footer className="border-t border-border">
                <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isPyodideReady={isPyodideReady}/>
            </footer>
        </div>
      </div>
    </div>
  );
};

export default App;