
import React from 'react';
import { Persona, SwarmMode, ChatMessage } from '../../types';
import { APP_TITLE } from '../../constants';
import { PolishEagleIcon } from '../../components/PolishEagleIcon';

export const Header: React.FC<{
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
  swarmMode: SwarmMode;
  onSwarmModeChange: (mode: SwarmMode) => void;
  isLoading: boolean;
  isPyodideReady: boolean;
  messages: ChatMessage[];
  onShowGuide: () => void;
  onExportSession: () => void;
}> = ({ 
    persona, 
    onPersonaChange, 
    swarmMode, 
    onSwarmModeChange, 
    isLoading, 
    isPyodideReady, 
    messages,
    onShowGuide,
    onExportSession
}) => {
  const lastMessage = messages[messages.length - 1];
  const currentTask = (isLoading && lastMessage?.taskType) ? lastMessage.taskType : 'Idle';

  const getStatusColor = () => {
    if (isLoading) return 'text-accent';
    if (!isPyodideReady) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusText = () => {
    if (isLoading) return `EXECUTING (${currentTask})`;
    if (!isPyodideReady) return 'INITIALIZING PYTHON';
    return 'READY';
  };

  return (
    <header className="bg-card p-4 border-b border-border z-20">
        <div className="flex justify-between items-center">
            <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center bg-accent rounded-sm" title="Agentura">
                <PolishEagleIcon className="w-8 h-8 text-background" />
            </div>
            
            <div className="flex items-center space-x-4">
                <span className="text-2xl text-accent font-bold">★</span>
                <h1 className="text-2xl font-bold text-foreground font-sans tracking-wider">{APP_TITLE}</h1>
                <span className="text-2xl text-accent font-bold">★</span>
            </div>

            <div className="w-10 h-10 flex-shrink-0"></div>
        </div>

        <div className="mt-4 pt-3 flex justify-center items-center text-xs font-mono border-t border-border/50 gap-4">
            <div className="border border-border/50 px-2 py-0.5 rounded-sm">
                <span className="text-foreground/60 mr-1">STATUS:</span>
                <span className={`font-bold ${getStatusColor()}`}>{getStatusText()}</span>
            </div>
            <div className="flex items-center bg-background rounded-sm p-1 border border-border">
              <span className="text-xs text-foreground/70 px-2">Swarm Mode:</span>
              {Object.values(SwarmMode).map((m) => (
                <button
                  key={m}
                  onClick={() => onSwarmModeChange(m)}
                  className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors duration-200 ${
                    swarmMode === m ? 'bg-border text-foreground' : 'text-foreground/70 hover:bg-card'
                  }`}
                  title={m === SwarmMode.TheRoundTable ? "Debate-and-Synthesis loop for creative tasks" : (m === SwarmMode.InformalCollaborators ? "Planner-driven flexible swarm" : "Fixed high-security pipeline")}
                >
                  {m}
                </button>
              ))}
            </div>
            
            <button 
                onClick={onShowGuide} 
                className="text-xs border border-border/50 px-2 py-0.5 rounded-sm text-foreground/70 hover:text-white hover:border-white/70 transition-colors"
            >
                Agentic Guide
            </button>
             <button 
                onClick={onExportSession} 
                className="text-xs border border-border/50 px-2 py-0.5 rounded-sm text-foreground/70 hover:text-white hover:border-white/70 transition-colors"
            >
                Export Session
            </button>
        </div>
    </header>
  );
};
