import React, { useRef, useEffect, useState } from 'react';
import { TaskType, WorkflowState, WorkflowStepState } from '../../types';
import { iconSvgs, agentGraphConfigs, svgToDataURI, GraphNode } from './graphConfigs';
import { WorkflowStepInspectorModal } from './WorkflowStepInspectorModal';

declare const vis: any;

const STATUS_COLORS = {
    pending: '#757575', // Inactive grey
    running: '#E53935', // Accent red
    completed: '#4CAF50', // Green
    failed: '#F44336', // Bright red
};

export const AgentGraphVisualizer: React.FC<{ taskType: TaskType, workflowState: WorkflowState }> = ({ taskType, workflowState }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const graphData = agentGraphConfigs[taskType];
    const [inspectorData, setInspectorData] = useState<{ node: GraphNode, state: WorkflowStepState } | null>(null);
    const [layoutDirection, setLayoutDirection] = useState<'LR' | 'UD'>('LR');

    useEffect(() => {
        if (!containerRef.current || !graphData || typeof vis === 'undefined') return;
        
        const nodes = new vis.DataSet(graphData.nodes.map(node => {
            const nodeState = workflowState[`node-${node.id}`] || { status: 'pending' };
            const color = STATUS_COLORS[nodeState.status] || STATUS_COLORS.pending;
            return {
                ...node,
                image: svgToDataURI(iconSvgs[node.icon as keyof typeof iconSvgs], nodeState.status === 'pending' ? STATUS_COLORS.pending : '#E0E0E0'),
                borderWidth: 2,
                color: {
                    border: color,
                    background: '#333333',
                    highlight: { border: color, background: '#4F4F4F' },
                },
            };
        }));
        
        const edges = new vis.DataSet(graphData.edges.map(edge => {
            const fromNodeState = workflowState[`node-${edge.from}`] || { status: 'pending' };
            const edgeColor = fromNodeState.status === 'completed' || fromNodeState.status === 'running' ? STATUS_COLORS.running : STATUS_COLORS.pending;
            return {
                ...edge,
                width: 1.5,
                color: { color: edgeColor, highlight: STATUS_COLORS.running },
                smooth: { type: 'cubicBezier' }
            };
        }));

        const data = { nodes, edges };
        const options = {
            layout: { 
                hierarchical: { 
                    direction: layoutDirection, 
                    sortMethod: 'directed', 
                    levelSeparation: 120 
                } 
            },
            physics: { enabled: false },
            interaction: { 
                dragNodes: false, 
                dragView: true, 
                zoomView: true, 
                selectable: true 
            },
            nodes: { shape: 'image', size: 22, font: { size: 11, color: '#E0E0E0', face: 'Roboto Mono' }, margin: 8 },
        };

        networkRef.current = new vis.Network(containerRef.current, data, options);

        const handleNodeClick = (params: any) => {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const nodeInfo = graphData.nodes.find(n => n.id === nodeId);
                const nodeState = workflowState[`node-${nodeId}`];
                if (nodeInfo && nodeState) {
                    setInspectorData({ node: nodeInfo, state: nodeState });
                }
            }
        };

        networkRef.current.on('click', handleNodeClick);
        
        return () => {
            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
            }
        };
    }, [taskType, graphData, layoutDirection]);

    useEffect(() => {
        if (!networkRef.current || !graphData || !workflowState || !networkRef.current.body) return;
        
        const nodesUpdate = graphData.nodes.map((node) => {
            const nodeState = workflowState[`node-${node.id}`] || { status: 'pending' };
            const color = STATUS_COLORS[nodeState.status] || STATUS_COLORS.pending;
            return {
                id: node.id,
                image: svgToDataURI(iconSvgs[node.icon as keyof typeof iconSvgs], nodeState.status === 'pending' ? STATUS_COLORS.pending : '#E0E0E0'),
                color: { border: color },
                label: nodeState.status === 'running' ? `${node.label}...` : node.label,
            };
        });

        const edgesUpdate = graphData.edges.map(edge => {
            const fromNodeState = workflowState[`node-${edge.from}`] || { status: 'pending' };
            const edgeColor = fromNodeState.status === 'completed' || fromNodeState.status === 'running' ? STATUS_COLORS.running : STATUS_COLORS.pending;
            return {
                id: edge.id,
                color: edgeColor,
                width: fromNodeState.status === 'completed' || fromNodeState.status === 'running' ? 2 : 1.5,
            };
        });
        
        networkRef.current.body.data.nodes.update(nodesUpdate);
        networkRef.current.body.data.edges.update(edgesUpdate);

    }, [workflowState, graphData]);

    if (!graphData) {
        return <div className="p-3 text-foreground/70 text-sm">Initializing workflow...</div>;
    }

    return (
        <>
            {inspectorData && (
                <WorkflowStepInspectorModal
                    data={inspectorData}
                    onClose={() => setInspectorData(null)}
                />
            )}
            <div className="mt-2 p-2 bg-card/50 rounded-sm border border-border/50">
                <div className="flex items-center justify-end gap-2 mb-2">
                    <button
                        onClick={() => setLayoutDirection('LR')}
                        className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                            layoutDirection === 'LR' ? 'bg-accent/80 text-white' : 'bg-background hover:bg-border'
                        }`}
                        title="Horizontal Layout"
                    >
                        H
                    </button>
                    <button
                        onClick={() => setLayoutDirection('UD')}
                        className={`px-2 py-0.5 text-xs rounded-sm transition-colors ${
                            layoutDirection === 'UD' ? 'bg-accent/80 text-white' : 'bg-background hover:bg-border'
                        }`}
                        title="Vertical Layout"
                    >
                        V
                    </button>
                </div>
                <div ref={containerRef} style={{ height: '100px' }} />
            </div>
        </>
    );
};
