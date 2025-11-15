
import React, { useState } from 'react';
import { CommandPalette } from './CommandPalette';
import { AgentGraphVisualizer } from './AgentGraphVisualizer';
import { AgentRoster } from './AgentRoster';
import { ArchiveManager } from './ArchiveManager';
import { useAppContext } from '../context/AppProvider'; // Import the context hook

// All props are removed
export const ContextPanel: React.FC = () => {
    // Get all state and handlers from the global context
    const {
        swarmMode,
        activeRoster,
        setActiveRoster, // Renamed from onRosterChange
        lastGraphableTask,
        setExplainAgent // Renamed from onShowAgentDetails
    } = useAppContext();

    const [activeTab, setActiveTab] = useState<View>('roster');

    const renderView = () => {
        switch(activeTab) {
            case 'commands':
                return <CommandPalette />;
            case 'graph':
                 return lastGraphableTask ? (
                    <AgentGraphVisualizer taskType={lastGraphableTask.taskType} workflowState={lastGraphableTask.workflowState} />
                ) : (
                    <div className="text-center text-xs text-foreground/50 py-8">
                        No task has been run yet.
                    </div>
                );
            case 'roster':
                return <AgentRoster 
                            swarmMode={swarmMode} 
                            activeRoster={activeRoster} 
                            onRosterChange={setActiveRoster}
                            onShowAgentDetails={setExplainAgent}
                       />;
            case 'archive': 
                return <ArchiveManager />;
            default:
                return null;
        }
    }

    return (
        <div className="h-full flex flex-col bg-card/50">
            <div className="flex-shrink-0 flex items-stretch border-b border-border">
                <div className="flex items-center">
                    <TabButton name="Agent Roster" view="roster" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton name="Archive" view="archive" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton name="Commands" view="commands" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton name="Graph" view="graph" activeTab={activeTab} setActiveTab={setActiveTab} />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto">
                {renderView()}
            </div>
        </div>
    );
};

type View = 'commands' | 'graph' | 'roster' | 'archive';

const TabButton: React.FC<{ name: string, view: View, activeTab: View, setActiveTab: (v: View) => void }> = 
({ name, view, activeTab, setActiveTab }) => (
    <button 
        onClick={() => setActiveTab(view)}
        className={`px-3 py-2 text-xs font-sans font-semibold uppercase tracking-wider transition-colors h-full ${
            activeTab === view ? 'text-foreground border-b-2 border-accent' : 'text-foreground/60 hover:text-foreground'
        }`}
    >
        {name}
    </button>
);
