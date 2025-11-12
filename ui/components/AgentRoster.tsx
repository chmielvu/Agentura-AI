
import React, { useMemo } from 'react';
import { SwarmMode, TaskType } from '../../types';
import { AGENT_ROSTER } from '../../constants';
import { BrainCircuitIcon } from '../../components/Icons'; // A generic icon

const SECURITY_SERVICE_ROSTER = [TaskType.Planner, TaskType.Research, TaskType.Code, TaskType.Critique];

interface AgentRosterProps {
    swarmMode: SwarmMode;
    activeRoster: TaskType[];
    onRosterChange: (roster: TaskType[]) => void;
    onShowAgentDetails: (agent: any) => void; // NEW
}

export const AgentRoster: React.FC<AgentRosterProps> = ({ swarmMode, activeRoster, onRosterChange, onShowAgentDetails }) => {
    const isInformalMode = swarmMode === SwarmMode.InformalCollaborators;

    const rosterToDisplay = useMemo(() => {
        return isInformalMode ? activeRoster : SECURITY_SERVICE_ROSTER;
    }, [isInformalMode, activeRoster]);

    const handleToggle = (taskType: TaskType) => {
        if (!isInformalMode) return;
        const newRoster = activeRoster.includes(taskType)
            ? activeRoster.filter(t => t !== taskType)
            : [...activeRoster, taskType];
        onRosterChange(newRoster);
    };

    return (
        <div className="p-2">
            <p className="text-xs text-foreground/60 mb-3 px-1">
                {isInformalMode 
                    ? "Select agents for the 'Informal Collaborators' swarm." 
                    : "The 'Security Service' swarm uses a fixed, pre-defined roster."}
            </p>
            <ul className="space-y-3">
                {Object.entries(AGENT_ROSTER).map(([taskType, agent]) => {
                    const isEnabled = rosterToDisplay.includes(taskType as TaskType);
                    return (
                        <li key={taskType} className="flex items-center justify-between p-1">
                            <div className="flex items-start gap-3 flex-1 overflow-hidden">
                                <BrainCircuitIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isEnabled ? 'text-accent' : 'text-foreground/40'}`} />
                                <div className="flex-1 overflow-hidden">
                                    <p className={`font-mono text-sm font-bold ${isEnabled ? 'text-foreground' : 'text-foreground/60'}`}>
                                        {agent.title}
                                        {/* --- NEW BUTTON --- */}
                                        <button 
                                            onClick={() => onShowAgentDetails(agent)} 
                                            className="ml-1.5 text-foreground/60 hover:text-white transition-colors"
                                            title="Explain this agent"
                                        >
                                            [?]
                                        </button>
                                        {/* --- END NEW BUTTON --- */}
                                    </p>
                                    <p className="text-xs text-foreground/60 leading-snug truncate" title={agent.description}>{agent.concise_description}</p>
                                </div>
                            </div>
                            {isInformalMode && (
                               <button
                                    onClick={() => handleToggle(taskType as TaskType)}
                                    aria-pressed={isEnabled}
                                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full ml-2"
                                >
                                    <div
                                        className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                            isEnabled
                                            ? 'bg-green-500 animate-led-pulse'
                                            : 'bg-red-900/70 border border-black/20'
                                        }`}
                                        style={{
                                            '--led-glow-color': isEnabled ? 'rgba(74, 222, 128, 0.6)' : 'transparent',
                                            boxShadow: isEnabled ? '0 0 4px 1px rgba(74, 222, 128, 0.5)' : 'inset 0 0 2px 0px black',
                                        } as React.CSSProperties}
                                    />
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};
