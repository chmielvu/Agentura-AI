


import React, { useState, useEffect } from 'react';
import { TaskType, WorkflowState } from '../../types';
import { TASK_CONFIGS } from '../../constants';
import { CodeBracketIcon, SearchIcon, PlanIcon, SparklesIcon, BrainCircuitIcon } from '../../components/Icons';
import { AgentGraphVisualizer } from './AgentGraphVisualizer';

const commandIcons: Record<string, React.FC<{className?: string}>> = {
    [TaskType.Code]: CodeBracketIcon,
    [TaskType.Research]: SearchIcon,
    [TaskType.Planner]: PlanIcon,
    [TaskType.Creative]: SparklesIcon,
    [TaskType.Complex]: BrainCircuitIcon,
};

const commandsToShow = [
    TaskType.Code,
    TaskType.Research,
    TaskType.Planner,
    TaskType.Creative,
    TaskType.Complex,
];

interface CommandPaletteProps {
    lastTask?: {
        taskType: TaskType;
        workflowState: WorkflowState;
    } | null;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ lastTask }) => {
    const [view, setView] = useState<'palette' | 'graph'>('palette');
    
    // Automatically switch to graph view when a new task starts
    useEffect(() => {
        if (lastTask) {
            setView('graph');
        }
    }, [lastTask?.workflowState?.['node-1']?.startTime]); // Trigger only when a new task truly begins
    
    return (
        <div className="border border-border p-4 h-full rounded-sm bg-card/50 flex flex-col">
            <div className="flex-shrink-0 flex items-center border-b border-border mb-4 -mx-4 px-1">
                <button 
                    onClick={() => setView('palette')}
                    className={`px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider transition-colors ${
                        view === 'palette' ? 'text-foreground border-b-2 border-accent' : 'text-foreground/60 hover:text-foreground'
                    }`}
                >
                    Command Palette
                </button>
                <button 
                    onClick={() => setView('graph')}
                    className={`px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider transition-colors ${
                        view === 'graph' ? 'text-foreground border-b-2 border-accent' : 'text-foreground/60 hover:text-foreground'
                    }`}
                >
                    Graph
                </button>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                {view === 'palette' && (
                    <ul className="space-y-4">
                        {commandsToShow.map(taskType => {
                            const config = TASK_CONFIGS[taskType];
                            const Icon = commandIcons[taskType];
                            if (!config || !Icon) return null;

                            return (
                                <li key={taskType}>
                                    <div className="flex items-start gap-3">
                                        <Icon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-mono text-sm font-bold text-foreground">/{taskType.toLowerCase()}</p>
                                            <p className="text-xs text-foreground/60 leading-snug">{config.description}</p>
                                        </div>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
                
                {view === 'graph' && (
                    lastTask && lastTask.taskType && lastTask.workflowState ? (
                        <AgentGraphVisualizer taskType={lastTask.taskType} workflowState={lastTask.workflowState} />
                    ) : (
                        <div className="text-center text-xs text-foreground/50 py-8">
                            No task has been run yet.
                        </div>
                    )
                )}
            </div>
        </div>
    );
};