
import React from 'react';
import { XCircleIcon } from '../../components/Icons';

export const ExplainAgentModal: React.FC<{ agent: any, onClose: () => void }> = ({ agent, onClose }) => {
    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-card border border-border w-full max-w-lg rounded-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 border-b border-border flex justify-between items-center">
                    <h2 className="text-lg font-sans font-semibold text-foreground">{agent.title}</h2>
                    <button onClick={onClose} className="text-foreground/70 hover:text-white transition-colors">
                        <XCircleIcon className="w-7 h-7" />
                    </button>
                </div>
                <div className="p-4 space-y-4 font-sans text-sm"> {/* Use font-sans */}
                    <p className="text-foreground/90">{agent.description}</p>
                    <div>
                        <h3 className="font-bold text-accent">Strengths:</h3>
                        <p className="text-foreground/80">{agent.strengths || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-accent">Weaknesses:</h3>
                        <p className="text-foreground/80">{agent.weaknesses || 'N/A'}</p>
                    </div>
                    <div>
                        <h3 className="font-bold text-accent">Example Prompt:</h3>
                        <pre className="text-xs bg-background p-2 rounded-sm border border-border/50 text-foreground/70 font-mono whitespace-pre-wrap break-words">
                            {agent.example_prompt || 'N/A'}
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
};
