
import React from 'react';
import { TaskType } from '../../types';
import { AGENT_ROSTER } from '../../constants';
import { 
    PlanIcon,
    SearchIcon,
    CodeBracketIcon,
    BrainCircuitIcon,
    SparklesIcon,
    DocumentTextIcon,
    OptimizeIcon,
    ChartBarIcon,
    WrenchScrewdriverIcon,
} from '../../components/Icons';

const taskToIcon: Record<TaskType, React.FC<{className?: string}>> = {
    [TaskType.Planner]: PlanIcon,
    [TaskType.Research]: SearchIcon,
    [TaskType.Code]: CodeBracketIcon,
    [TaskType.Critique]: BrainCircuitIcon, // Not shown
    [TaskType.Chat]: BrainCircuitIcon, // Not shown
    [TaskType.Complex]: BrainCircuitIcon,
    [TaskType.Vision]: BrainCircuitIcon, // Not shown
    [TaskType.Creative]: SparklesIcon,
    [TaskType.Retry]: BrainCircuitIcon, // Not shown
    [TaskType.ManualRAG]: DocumentTextIcon,
    [TaskType.Meta]: OptimizeIcon,
    [TaskType.DataAnalyst]: ChartBarIcon,
    [TaskType.Maintenance]: WrenchScrewdriverIcon,
    [TaskType.Embedder]: BrainCircuitIcon, // Not shown
    [TaskType.Reranker]: BrainCircuitIcon, // Not shown
};

const commandsToShow = [
    TaskType.Code,
    TaskType.Research,
    TaskType.Planner,
    TaskType.DataAnalyst,
    TaskType.Creative,
    TaskType.Complex,
    TaskType.Meta,
    TaskType.ManualRAG,
    TaskType.Maintenance,
];

export const CommandPalette: React.FC = () => {
    return (
        <div className="p-2">
             <p className="text-xs text-foreground/60 mb-3">
                Force the next message to be handled by a specific agent using a command.
            </p>
            <ul className="space-y-4">
                {commandsToShow.map(taskType => {
                    const config = AGENT_ROSTER[taskType];
                    const Icon = taskToIcon[taskType];
                    if (!config || !Icon) return null;
                    
                    let command = `/${taskType.toLowerCase()}`;
                    if (taskType === TaskType.Meta) command = '/add_agent';
                    if (taskType === TaskType.ManualRAG) command = '/manualrag';

                    return (
                        <li key={taskType}>
                            <div className="flex items-start gap-3">
                                <Icon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-mono text-sm font-bold text-foreground">{command}</p>
                                    <p className="text-xs text-foreground/60 leading-snug">{config.concise_description}</p>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};