
import React from 'react';
import { TaskType } from '../../types';
import { AGENT_ROSTER } from '../../constants';
import { BrainCircuitIcon } from '../../components/Icons';

const commandIcons: Record<string, React.FC<{className?: string}>> = Object.keys(AGENT_ROSTER)
    .reduce((acc, key) => {
        acc[key] = BrainCircuitIcon;
        return acc;
    }, {} as Record<string, React.FC<{className?: string}>>);

const commandsToShow = [
    TaskType.Code,
    TaskType.Research,
    TaskType.Planner,
    TaskType.DataAnalyst, // NEW
    TaskType.Creative,
    TaskType.Complex,
    TaskType.Meta,
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
                    const Icon = commandIcons[taskType];
                    if (!config || !Icon) return null;
                    const command = taskType === TaskType.Meta ? '/add_agent' : `/${taskType.toLowerCase()}`;
                    return (
                        <li key={taskType}>
                            <div className="flex items-start gap-3">
                                <Icon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-mono text-sm font-bold text-foreground">{command}</p>
                                    <p className="text-xs text-foreground/60 leading-snug">{config.description}</p>
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
