import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Persona, ChatMessage, Plan } from './types';
import { useModularOrchestrator } from './ui/hooks/useModularOrchestrator';
import { Header } from './ui/components/Header';
import { Message } from './ui/components/Message';
import { ChatInput } from './ui/components/ChatInput';
import { HUD } from './ui/components/HUD';
import DebuggerModal from './components/Debugger';

const App: React.FC = () => {
  const [persona, setPersona] = useState<Persona>(() => (localStorage.getItem('agentic-chat-persona') as Persona) || Persona.Default);
  const pyodideRef = useRef<any>(null);
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const [debugSession, setDebugSession] = useState<{ code: string; onComplete: (output: string) => void; } | null>(null);

  const initialMessages = useMemo(() => {
    try {
      const saved = localStorage.getItem('agentic-chat-messages');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  }, []);

  const { messages, setMessages, isLoading, handleSendMessage, handleExecuteCode, handleExecutePlan } = useModularOrchestrator(initialMessages, persona, pyodideRef);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  useEffect(() => localStorage.setItem('agentic-chat-persona', persona), [persona]);

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

  const handlePersonaChange = (newPersona: Persona) => {
    if (newPersona === persona) return;
    if (messages.length > 0 && window.confirm("Changing persona will clear the conversation. Continue?")) {
        setMessages([]);
    }
    setPersona(newPersona);
  };
  
  const handleDebugCode = (messageId: string, functionCallId: string) => {
    const msg = messages.find(m => m.id === messageId);
    const fc = msg?.functionCalls?.find(f => f.id === functionCallId);
    if (!msg || !fc || !pyodideRef.current) return;
    
    // The `onComplete` for the debugger will re-trigger the PWC loop by calling `handleExecuteCode`.
    setDebugSession({
      code: fc.args.code,
      onComplete: (output: string) => {
        // The orchestrator's `continueCodePwcLoop` needs the output. We can pass it via `handleExecuteCode`.
        // This is a simplification; a real implementation might pass a callback.
        // For now, we simulate the user clicking "execute" after debugging is done.
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
      <Header persona={persona} onPersonaChange={handlePersonaChange} />
      <HUD isLoading={isLoading} isPyodideReady={isPyodideReady} messages={messages} />
      
      <main className="flex-1 overflow-y-auto pt-40 pb-4">
        <div className="max-w-4xl mx-auto px-4">
          {messages.length === 0 && !isLoading ? (
            <div className="text-center text-foreground/70 mt-8">
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
                    onExecutePlan={handleExecutePlan}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </main>
      
      <footer className="sticky bottom-0 left-0 right-0">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isPyodideReady={isPyodideReady}/>
      </footer>
    </div>
  );
};

export default App;
