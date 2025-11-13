
import React, { useMemo } from 'react';
import { SwarmMode, TaskType } from '../../types';
import { AGENT_ROSTER } from '../../constants';
import { 
    PlanIcon,
    SearchIcon,
    CodeBracketIcon,
    CritiqueIcon,
    ChatBubbleLeftRightIcon,
    BrainCircuitIcon,
    ImageIcon,
    SparklesIcon,
    DocumentTextIcon,
    OptimizeIcon,
    ChartBarIcon,
    WrenchScrewdriverIcon,
} from '../../components/Icons';

export const taskToIcon: Record<TaskType, React.FC<{className?: string}>> = {
    [TaskType.Planner]: PlanIcon,
    [TaskType.Research]: SearchIcon,
    [TaskType.Code]: CodeBracketIcon,
    [TaskType.Critique]: CritiqueIcon,
    [TaskType.Chat]: ChatBubbleLeftRightIcon,
    [TaskType.Complex]: BrainCircuitIcon,
    [TaskType.Vision]: ImageIcon,
    [TaskType.Creative]: SparklesIcon,
    [TaskType.Retry]: BrainCircuitIcon, // Internal
    [TaskType.ManualRAG]: DocumentTextIcon,
    [TaskType.Meta]: OptimizeIcon,
    [TaskType.DataAnalyst]: ChartBarIcon,
    [TaskType.Maintenance]: WrenchScrewdriverIcon,
    [TaskType.Embedder]: BrainCircuitIcon, // Internal
    [TaskType.Reranker]: BrainCircuitIcon, // Internal
    [TaskType.Verifier]: BrainCircuitIcon, // Internal
};

const SECURITY_SERVICE_ROSTER = [TaskType.Planner, TaskType.Research, TaskType.Code, TaskType.Critique];

// --- Internal agents to hide from UI ---
const INTERNAL_AGENTS = [
    TaskType.Reranker,
    TaskType.Embedder,
    TaskType.Verifier,
    TaskType.Retry,
];

interface AgentRosterProps {
    swarmMode: SwarmMode;
    activeRoster: TaskType[];
    onRosterChange: (roster: TaskType[]) => void;
    onShowAgentDetails: (agent: any) => void;
}

export const AgentRoster: React.FC<AgentRosterProps> = ({ swarmMode, activeRoster, onRosterChange, onShowAgentDetails }) => {
    const isInformalMode = swarmMode === SwarmMode.InformalCollaborators;

    const rosterToDisplay = useMemo(() => {
        const allAgents = Object.values(TaskType).filter(t => !INTERNAL_AGENTS.includes(t));
        return isInformalMode ? allAgents : SECURITY_SERVICE_ROSTER;
    }, [isInformalMode]);
    
    const activeRosterSet = useMemo(() => new Set(activeRoster), [activeRoster]);

    const handleToggle = (taskType: TaskType) => {
        if (!isInformalMode) return;
        const newRoster = new Set(activeRoster);
        if (newRoster.has(taskType)) {
            newRoster.delete(taskType);
        } else {
            newRoster.add(taskType);
        }
        onRosterChange(Array.from(newRoster));
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
                    // Hide internal agents from the roster
                    if (INTERNAL_AGENTS.includes(taskType as TaskType)) return null;

                    const isEnabled = rosterToDisplay.includes(taskType as TaskType);
                    const isActive = activeRosterSet.has(taskType as TaskType);
                    const Icon = taskToIcon[taskType as TaskType] || BrainCircuitIcon;

                    return (
                        <li key={taskType} className="flex items-center justify-between p-1">
                            <div className="flex items-start gap-3 flex-1 overflow-hidden">
                                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isEnabled ? 'text-accent' : 'text-foreground/40'}`} />
                                <div className="flex-1 overflow-hidden">
                                    <p className={`font-mono text-sm font-bold ${isEnabled ? 'text-foreground' : 'text-foreground/60'}`}>
                                        {agent.title}
                                        <button 
                                            onClick={() => onShowAgentDetails(agent)} 
                                            className="ml-1.5 text-foreground/60 hover:text-white transition-colors"
                                            title="Explain this agent"
                                        >
                                            [?]
                                        </button>
                                    </p>
                                    <p className="text-xs text-foreground/60 leading-snug truncate" title={agent.description}>
                                        {agent.concise_description}
                                    </p>
                                </div>
                            </div>
                            {isInformalMode && (
                               <button
                                    onClick={() => handleToggle(taskType as TaskType)}
                                    aria-pressed={isActive}
                                    className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-full ml-2"
                                >
                                    <div
                                        className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                            isActive
                                            ? 'bg-green-500 animate-led-pulse'
                                            : 'bg-red-900/70 border border-black/20'
                                        }`}
                                        style={{
                                            '--led-glow-color': isActive ? 'rgba(74, 222, 128, 0.6)' : 'transparent',
                                            boxShadow: isActive ? '0 0 4px 1px rgba(74, 222, 128, 0.5)' : 'inset 0 0 2px 0px black',
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
