import React from 'react';
import { WorkflowStepState } from '../../types';
import { GraphNode } from './graphConfigs';
import { XCircleIcon } from '../../components/Icons';

interface InspectorProps {
  data: {
    node: GraphNode;
    state: WorkflowStepState;
  };
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
    pending: 'border-gray-500 text-gray-400',
    running: 'border-accent text-accent animate-pulse',
    completed: 'border-green-500 text-green-400',
    failed: 'border-red-600 text-red-500',
};

export const WorkflowStepInspectorModal: React.FC<InspectorProps> = ({ data, onClose }) => {
    const { node, state } = data;

    const renderDetails = () => {
        if (!state.details) {
            return <p className="text-foreground/50 text-sm">No details available for this step.</p>;
        }
        return (
            <pre className="text-xs bg-background p-3 rounded-sm border border-border/50 max-h-80 overflow-y-auto">
                <code>{JSON.stringify(state.details, null, 2)}</code>
            </pre>
        );
    };

    const duration = state.startTime && state.endTime ? `${((state.endTime - state.startTime) / 1000).toFixed(2)}s` : 'N/A';

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-card border border-border w-full max-w-2xl flex flex-col rounded-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-border">
                    <div>
                        <h2 className="text-lg font-sans font-semibold text-foreground">{node.label}</h2>
                        <p className="text-sm text-foreground/70">Workflow Step Details</p>
                    </div>
                    <button onClick={onClose} className="text-foreground/70 hover:text-white transition-colors">
                        <XCircleIcon className="w-7 h-7" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-background p-3 rounded-sm border border-border/50">
                            <p className="text-xs text-foreground/60 mb-1">Status</p>
                            <p className={`font-mono font-bold uppercase border-l-2 px-2 ${STATUS_STYLES[state.status] || ''}`}>
                                {state.status}
                            </p>
                        </div>
                        <div className="bg-background p-3 rounded-sm border border-border/50">
                            <p className="text-xs text-foreground/60 mb-1">Execution Time</p>
                            <p className="font-mono font-bold text-foreground/90">{duration}</p>
                        </div>
                    </div>
                    <div>
                         <p className="text-xs text-foreground/60 mb-1">Context & Logs</p>
                         {renderDetails()}
                    </div>
                </div>
            </div>
        </div>
    );
};
