
import React, { useRef, useEffect } from 'react';
import { Header } from './ui/components/Header';
import { Message } from './ui/components/Message';
import { ChatInput } from './ui/components/ChatInput';
import { ContextPanel } from './ui/components/ContextPanel';
import { FeedbackModal } from './ui/components/FeedbackModal';
import { GuideModal } from './ui/components/GuideModal';
import { ExplainAgentModal } from './ui/components/ExplainAgentModal';
import { AestheticPanel } from './ui/components/AestheticPanel';
import { useAppContext } from './ui/context/AppProvider'; // Import the context hook

const App: React.FC = () => {
  // Get all state and handlers from the global context
  const {
    messages,
    isLoading,
    feedbackModal,
    setFeedbackModal,
    addSessionFeedback,
    isGuideOpen,
    setIsGuideOpen,
    explainAgent,
    setExplainAgent,
    handleExecuteCode,
    handleExecutePlan
  } = useAppContext();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="h-screen w-screen flex flex-row bg-background text-foreground font-mono">
      {/* Modals are now driven by global state */}
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
      
      {/* LEFT COLUMN */}
      <div className="w-[350px] flex-shrink-0 flex flex-col border-r border-border">
          <AestheticPanel />
          <div className="flex-1 overflow-y-auto">
              {/* ContextPanel now consumes state internally */}
              <ContextPanel />
          </div>
      </div>
      
      {/* RIGHT COLUMN */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header now consumes state internally */}
        <Header />
        
        <div className="flex-1 flex flex-col overflow-hidden">
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
                            onExecuteCode={(msgId, fcId) => handleExecuteCode(msgId, fcId, undefined)}
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
                {/* ChatInput now consumes state internally */}
                <ChatInput />
            </footer>
        </div>
      </div>
    </div>
  );
};

export default App;
