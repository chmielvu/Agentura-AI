import React, { useRef, useEffect } from 'react';
import { TaskType } from '../../types';
import { iconSvgs, agentGraphConfigs } from './graphConfigs';

declare const vis: any;

export const AgentGraphVisualizer: React.FC<{ taskType: TaskType, activeStep: number }> = ({ taskType, activeStep }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const graphData = agentGraphConfigs[taskType];

    useEffect(() => {
        if (!containerRef.current || !graphData || typeof vis === 'undefined') return;

        const nodes = new vis.DataSet(graphData.nodes);
        const edges = new vis.DataSet(graphData.edges);

        const data = { nodes, edges };
        const options = {
            layout: { hierarchical: { direction: 'LR', sortMethod: 'directed', levelSeparation: 120 } },
            physics: { enabled: false },
            interaction: { dragNodes: false, dragView: false, zoomView: false, selectable: false },
            nodes: { shape: 'image', size: 22, font: { size: 11, color: '#E0E0E0', face: 'Roboto Mono' }, margin: 8 },
            edges: { width: 1.5, color: { color: '#757575', highlight: '#E53935' }, smooth: { type: 'cubicBezier' } }
        };

        networkRef.current = new vis.Network(containerRef.current, data, options);
        
        return () => {
            if (networkRef.current) {
                networkRef.current.destroy();
                networkRef.current = null;
            }
        };
    }, [taskType, graphData]);

    useEffect(() => {
        if (!networkRef.current || !graphData || activeStep === 0) return;
        
        const activeColor = '#E53935';
        const inactiveColor = '#757575';
        
        const nodesUpdate = graphData.nodes.map((node) => ({
            id: node.id,
            image: activeStep >= node.id ? node.image.replace(inactiveColor, activeColor) : node.image,
        }));
        
        const edgesUpdate = graphData.edges.map(edge => ({
            id: `${edge.from}_${edge.to}`,
            color: activeStep > edge.from ? activeColor : inactiveColor,
            width: activeStep > edge.from ? 2 : 1.5,
        }));

        networkRef.current.body.data.nodes.update(nodesUpdate);
        networkRef.current.body.data.edges.update(edgesUpdate);

    }, [activeStep, graphData]);

    if (!graphData) {
        return <div className="p-3 text-foreground/70 text-sm">Initializing workflow...</div>;
    }

    return (
        <div className="mt-2 p-2 bg-card/50 rounded-sm border border-border/50">
            <div ref={containerRef} style={{ height: '100px' }} />
        </div>
    );
};
