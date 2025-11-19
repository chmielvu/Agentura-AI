import React from 'react';
import { ChatMessage, TaskType } from '../../types';
import { useAppContext } from '../context/AppProvider';
import { SparklesIcon } from '../../components/Icons';

export const FollowUpSuggestions: React.FC<{ message: ChatMessage }> = ({ message }) => {
    const { handleSendMessage } = useAppContext();

    if (!message.followUpSuggestions && message.isLoading === false) {
        // Show a subtle loading state while generating
        return (
            <div className="mt-3 pt-3 border-t border-border/50 text-xs text-foreground/60 animate-pulse">
                Generating suggestions...
            </div>
        );
    }

    if (!message.followUpSuggestions || message.followUpSuggestions.length === 0) {
        return null;
    }

    const handleSuggestionClick = (prompt: string) => {
        // Find if it's a command
        const commandMatch = prompt.match(/^\/(\w+)/);
        if (commandMatch && commandMatch[1]) {
            const commandText = commandMatch[1].toLowerCase();
            
            // Find the matching TaskType (case-insensitive)
            // This handles cases like '/manualrag' -> TaskType.ManualRAG
            const task = Object.values(TaskType).find(t => t.toLowerCase() === commandText);
            
            // Also check for special meta command
            const isMeta = commandText === 'add_agent';
            
            if (task) {
                const content = prompt.replace(commandMatch[0], '').trim();
                handleSendMessage(content, undefined, undefined, task);
            } else if (isMeta) {
                const content = prompt.replace('/add_agent', '').trim();
                handleSendMessage(content, undefined, undefined, TaskType.Meta);
            } else {
                 // If invalid command, just send as text
                 handleSendMessage(prompt);
            }
        } else {
            handleSendMessage(prompt);
        }
    };

    return (
        <div className="mt-3 pt-3 border-t border-border/50">
            <h4 className="text-xs font-semibold text-foreground/80 mb-2 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-accent" />
                Next Steps:
            </h4>
            <div className="flex flex-wrap gap-2">
                {message.followUpSuggestions.map((suggestion, index) => (
                    <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="text-xs bg-background hover:bg-border px-3 py-1.5 rounded-sm transition-colors text-left"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    );
};