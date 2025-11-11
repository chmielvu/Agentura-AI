import React from 'react';
import { Persona, ChatMode, ChatMessage, TaskType } from '../../types';
import { APP_TITLE } from '../../constants';

export const Header: React.FC<{
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  isLoading: boolean;
  isPyodideReady: boolean;
  messages: ChatMessage[];
}> = ({ persona, onPersonaChange, mode, onModeChange, isLoading, isPyodideReady, messages }) => {
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
    <header className="bg-card p-4 border-b border-border fixed top-0 left-0 right-0 z-20">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3">
            <span className="text-2xl text-accent font-bold">★</span>
            <h1 className="text-2xl font-bold text-foreground font-sans tracking-wider">{APP_TITLE}</h1>
            <span className="text-2xl text-accent font-bold">★</span>
          </div>
          <div className='flex flex-wrap justify-end items-center gap-2'>
            <div className="flex items-center bg-background rounded-sm p-1 border border-border">
              <span className="text-xs text-foreground/70 px-2">MoE Persona:</span>
              {Object.values(Persona).map((p) => (
                <button
                  key={p}
                  onClick={() => onPersonaChange(p)}
                  className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors duration-200 ${
                    persona === p ? 'bg-accent/80 text-white' : 'text-foreground/80 hover:bg-card'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <div className="flex items-center bg-background rounded-sm p-1 border border-border">
              <span className="text-xs text-foreground/70 px-2">Mode:</span>
              {Object.values(ChatMode).map((m) => (
                <button
                  key={m}
                  onClick={() => onModeChange(m)}
                  className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors duration-200 ${
                    m === ChatMode.Developer ? 'text-red-400' : 'text-green-400'
                  } ${
                    mode === m ? 'bg-border' : 'hover:bg-card'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 flex justify-between items-center text-xs font-mono border-t border-border/50">
            <div className="flex items-center gap-4">
                <div className="border border-border/50 px-2 py-0.5 rounded-sm">
                    <span className="text-foreground/60 mr-1">STATUS:</span>
                    <span className={`font-bold ${getStatusColor()}`}>{getStatusText()}</span>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-foreground/60">PYTHON:</span>
                <span className={isPyodideReady ? 'text-green-500' : 'text-yellow-500'}>
                    {isPyodideReady ? 'READY' : 'LOADING...'}
                </span>
            </div>
        </div>
      </div>
    </header>
  );
};