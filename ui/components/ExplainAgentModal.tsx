import React from 'react';
import { XCircleIcon } from '../../components/Icons';

export const ExplainAgentModal: React.FC<{ agent: any, onClose: () => void }> = ({ agent, onClose }) => {
    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-lg sm:rounded-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                     <h2 className="text-lg font-sans font-semibold leading-none tracking-tight text-foreground">{agent.title}</h2>
                </div>
                <div className="space-y-4 font-sans text-sm">
                    <p className="text-muted-foreground">{agent.description}</p>
                    <div>
                        <h3 className="font-bold text-primary">Strengths:</h3>
                        <p className="text-foreground/80">{agent.strengths || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-primary">Weaknesses:</h3>
                        <p className="text-foreground/80">{agent.weaknesses || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-primary">Example Prompt:</h3>
                        <pre className="text-xs bg-background p-2 rounded-md border border-border/50 text-muted-foreground font-mono whitespace-pre-wrap break-words mt-1">
                            {agent.example_prompt || 'N/A'}
                        </pre>
                    </div>
                </div>
                <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                    <XCircleIcon className="h-5 w-5" />
                    <span className="sr-only">Close</span>
                </button>
            </div>
        </div>
    );
};