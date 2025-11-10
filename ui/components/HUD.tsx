import React from 'react';
import { ChatMessage, TaskType } from '../../types';

export const HUD: React.FC<{
    isLoading: boolean;
    isPyodideReady: boolean;
    messages: ChatMessage[];
}> = ({ isLoading, isPyodideReady, messages }) => {
    const lastMessage = messages[messages.length - 1];
    const currentTask = (isLoading && lastMessage?.taskType) ? lastMessage.taskType : 'Idle';

    const getStatusColor = () => {
        if (isLoading) return 'text-accent';
        if (!isPyodideReady) return 'text-yellow-500';
        return 'text-green-500';
    }

    const getStatusText = () => {
        if (isLoading) return `EXECUTING (${currentTask})`;
        if (!isPyodideReady) return 'INITIALIZING PYTHON';
        return 'READY';
    }

    return (
        <div className="fixed top-24 left-0 right-0 z-10 bg-card/80 backdrop-blur-sm border-b border-border">
            <div className="max-w-4xl mx-auto px-4 py-1.5 flex justify-between items-center text-xs font-mono">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-foreground/60">STATUS:</span>
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
    );
};
