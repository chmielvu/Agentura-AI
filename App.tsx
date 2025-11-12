
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
import { useEmbeddingService } from './ui/hooks/useEmbeddingService';
import { GuideModal } from './ui/components/GuideModal';
import { ExplainAgentModal } from './ui/components/ExplainAgentModal';

const getInitialSwarmMode = () => (localStorage.getItem('agentic-swarm-mode') as SwarmMode) || SwarmMode.InformalCollaborators;
const gitHubRepoRegex = /https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/;

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
  
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [explainAgent, setExplainAgent] = useState<any | null>(null);
  const { isReady: isEmbedderReady, processAndEmbedDocument } = useEmbeddingService();
  const [embeddingStatus, setEmbeddingStatus] = useState<{ title: string; progress: number; total: number } | null>(null);


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
  
  useEffect(() => {
    if (!isEmbedderReady) return;

    const ingestGuide = async () => {
        const isIngested = localStorage.getItem('agentic_guide_ingested_v2');
        if (isIngested) return;

        console.log("Ingesting Agentic Guide for the first time...");
        try {
            const guideFiles = [
                'canvas_assets/guide/01_Introduction.md',
                'canvas_assets/guide/02_Planning.md',
                'canvas_assets/guide/03_Reflexion.md',
                'canvas_assets/guide/04_RAG_and_Self_Augmentation.md',
                'canvas_assets/guide/05_Reasoning_Patterns.md'
            ];

            for (const path of guideFiles) {
                const response = await fetch(path);
                if (!response.ok) throw new Error(`Failed to fetch ${path}`);
                const text = await response.text();
                await processAndEmbedDocument(path, text);
            }
            localStorage.setItem('agentic_guide_ingested_v2', 'true');
            console.log("Agentic Guide ingestion complete.");
        } catch (e) {
            console.error("Failed to ingest agentic guide:", e);
        }
    };
    ingestGuide();
  }, [isEmbedderReady, processAndEmbedDocument]);

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
  
  const handleExportSession = () => {
    const { messages } = state;
    let markdownContent = `# Agentura AI Session\n\n*Exported on: ${new Date().toISOString()}*\n\n---\n\n`;

    messages.forEach(msg => {
        if (msg.role === 'user') {
            markdownContent += `> **User:**\n> ${msg.content.replace(/\n/g, '\n> ')}\n\n`;
        } else if (msg.role === 'assistant' && msg.content) {
            markdownContent += `**Assistant (${msg.taskType || 'Chat'}):**\n${msg.content}\n\n`;
        } else if (msg.plan) {
            markdownContent += `**Assistant (Planner):**\n*Generated Plan:*\n`;
            msg.plan.plan.forEach(step => {
                markdownContent += `1.  **[${step.status.toUpperCase()}]** ${step.description} (Tool: ${step.tool_to_use})\n`;
                if (step.result && step.status === 'completed') {
                    markdownContent += `    * **Result:** \`${step.result.substring(0, 150).replace(/\n/g, ' ')}...\`\n`;
                } else if (step.result && step.status === 'failed') {
                    markdownContent += `    * **Failure:** \`${step.result}\`\n`;
                }
            });
            markdownContent += `\n`;
        }
    });

    const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentura-session-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEmbedFile = async (docName: string, text: string) => {
    const chunks = text.split('\n\n').filter(t => t.trim().length > 20);
    const total = chunks.length;
    if (total === 0) return;

    setEmbeddingStatus({ title: `Embedding ${docName}`, progress: 0, total });
    try {
      await processAndEmbedDocument(docName, text, ({ current, total }) => {
        setEmbeddingStatus({ title: `Embedding ${docName}`, progress: current, total });
      });
      setTimeout(() => setEmbeddingStatus(null), 1500);
    } catch (e) {
      console.error(e);
      alert(`Failed to embed ${docName}.`);
      setEmbeddingStatus(null);
    }
  };

  const handleIngestRepo = async (url: string) => {
    const match = url.match(gitHubRepoRegex);
    if (!match) return;

    const [_, owner, repo] = match;
    const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;

    try {
        setEmbeddingStatus({ title: `Fetching repo tree for ${repo}...`, progress: 0, total: 1 });
        const treeResponse = await fetch(treeUrl);
        if (!treeResponse.ok) throw new Error(`GitHub API error: ${treeResponse.statusText}`);
        const treeData = await treeResponse.json();

        if (!treeData.tree || !Array.isArray(treeData.tree)) {
            throw new Error("Could not parse repository file tree. The repository might be empty or invalid.");
        }

        const filesToIngest = treeData.tree
            .map((file: any) => file.path)
            .filter((path: string) => 
                (path.endsWith('.md') || path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.py') || path.endsWith('.txt')) && !path.includes('node_modules')
            );

        if (filesToIngest.length === 0) {
            alert("No ingestible files (.md, .ts, .js, .py, .txt) found in the main branch.");
            setEmbeddingStatus(null);
            return;
        }

        if (window.confirm(`Ingest ${filesToIngest.length} relevant files from ${repo}? This may take a moment.`)) {
            setEmbeddingStatus({ title: `Ingesting ${filesToIngest.length} files from ${repo}`, progress: 0, total: filesToIngest.length });
            for (let i = 0; i < filesToIngest.length; i++) {
                const path = filesToIngest[i];
                setEmbeddingStatus({ title: `Ingesting: ${path}`, progress: i, total: filesToIngest.length });
                const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
                const fileContent = await (await fetch(fileUrl)).text();
                await processAndEmbedDocument(path, fileContent);
            }
            setEmbeddingStatus({ title: 'Ingestion complete!', progress: filesToIngest.length, total: filesToIngest.length });
            setTimeout(() => setEmbeddingStatus(null), 1500);
        } else {
            setEmbeddingStatus(null);
        }
    } catch (e: any) {
        alert(`Failed to fetch repository. Error: ${e.message}`);
        setEmbeddingStatus(null);
    }
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
      {isGuideOpen && (
          <GuideModal onClose={() => setIsGuideOpen(false)} />
      )}
      {explainAgent && (
          <ExplainAgentModal agent={explainAgent} onClose={() => setExplainAgent(null)} />
      )}
      
      <Header
        persona={persona}
        onPersonaChange={handlePersonaChange}
        swarmMode={swarmMode}
        onSwarmModeChange={handleSwarmModeChange}
        isLoading={isLoading}
        isPyodideReady={isPyodideReady}
        messages={messages}
        onShowGuide={() => setIsGuideOpen(true)}
        onExportSession={handleExportSession}
      />
      
      <div className="flex-1 flex flex-row overflow-hidden">
        <aside className="w-[350px] flex-shrink-0 border-r border-border">
          <ContextPanel 
            swarmMode={swarmMode}
            activeRoster={activeRoster}
            onRosterChange={setActiveRoster}
            lastTask={lastGraphableTask}
            onShowAgentDetails={setExplainAgent}
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
                <ChatInput 
                    onSendMessage={handleSendMessage} 
                    isLoading={isLoading} 
                    isPyodideReady={isPyodideReady}
                    isEmbedderReady={isEmbedderReady}
                    onEmbedFile={handleEmbedFile}
                    onIngestRepo={handleIngestRepo}
                    embeddingStatus={embeddingStatus}
                />
            </footer>
        </div>
      </div>
    </div>
  );
};

export default App;
