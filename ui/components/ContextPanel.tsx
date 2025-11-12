
import React, { useState } from 'react';
import { SwarmMode, TaskType, WorkflowState } from '../../types';
import { CommandPalette } from './CommandPalette';
import { AgentGraphVisualizer } from './AgentGraphVisualizer';
import { AgentRoster } from './AgentRoster';
import { ArchiveManager } from './ArchiveManager';

interface ContextPanelProps {
    swarmMode: SwarmMode;
    activeRoster: TaskType[];
    onRosterChange: (roster: TaskType[]) => void;
    lastTask?: {
        taskType: TaskType;
        workflowState: WorkflowState;
    } | null;
    onShowAgentDetails: (agent: any) => void; // NEW
}

type View = 'commands' | 'graph' | 'roster' | 'archive';

export const ContextPanel: React.FC<ContextPanelProps> = (props) => {
    const [activeTab, setActiveTab] = useState<View>('roster');

    const renderView = () => {
        switch(activeTab) {
            case 'commands':
                return <CommandPalette />;
            case 'graph':
                 return props.lastTask ? (
                    <AgentGraphVisualizer taskType={props.lastTask.taskType} workflowState={props.lastTask.workflowState} />
                ) : (
                    <div className="text-center text-xs text-foreground/50 py-8">
                        No task has been run yet.
                    </div>
                );
            case 'roster':
                return <AgentRoster 
                            swarmMode={props.swarmMode} 
                            activeRoster={props.activeRoster} 
                            onRosterChange={props.onRosterChange}
                            onShowAgentDetails={props.onShowAgentDetails} // Pass prop
                       />;
            case 'archive': 
                return <ArchiveManager />;
            default:
                return null;
        }
    }

    return (
        <div className="h-full flex flex-col bg-card/50">
            <div className="flex-shrink-0 flex items-center border-b border-border">
                <TabButton name="Agent Roster" view="roster" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton name="Archive" view="archive" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton name="Commands" view="commands" activeTab={activeTab} setActiveTab={setActiveTab} />
                <TabButton name="Graph" view="graph" activeTab={activeTab} setActiveTab={setActiveTab} />
            </div>
            <div className="flex-1 overflow-y-auto">
                {renderView()}
            </div>
        </div>
    );
};

const TabButton: React.FC<{ name: string, view: View, activeTab: View, setActiveTab: (v: View) => void }> = 
({ name, view, activeTab, setActiveTab }) => (
    <button 
        onClick={() => setActiveTab(view)}
        className={`px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider transition-colors ${
            activeTab === view ? 'text-foreground border-b-2 border-accent' : 'text-foreground/60 hover:text-foreground'
        }`}
    >
        {name}
    </button>
);
