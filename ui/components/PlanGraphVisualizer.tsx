
import React, { useRef, useEffect } from 'react';
import { Plan } from '../../types';

declare const vis: any; // vis-network is loaded from index.html

const STATUS_COLORS: Record<string, string> = {
    pending: '#757575',    // Grey
    'in-progress': '#E53935', // Red Accent
    completed: '#4CAF50', // Green
    failed: '#F44336',    // Bright Red
};

export const PlanGraphVisualizer: React.FC<{ plan: Plan }> = ({ plan }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);

    // Effect for initializing and updating the graph
    useEffect(() => {
        if (!containerRef.current || typeof vis === 'undefined' || plan.plan.length === 0) return;

        // Create nodes
        const nodes = new vis.DataSet(
            plan.plan.map(step => ({
                id: step.step_id,
                label: `Step ${step.step_id}\n(${step.tool_to_use})`,
                color: {
                    border: STATUS_COLORS[step.status] || STATUS_COLORS.pending,
                    background: '#2d2d2d',
                    highlight: { border: STATUS_COLORS[step.status], background: '#3c3c3c' },
                },
                font: { color: '#e0e0e0', face: 'Roboto Mono', size: 12 },
            }))
        );

        // Create edges based on dependencies
        const edges = new vis.DataSet(
            plan.plan.flatMap(step => 
                (step.dependencies || []).map(depId => {
                    const depStep = plan.plan.find(s => s.step_id === depId);
                    const edgeColor = (depStep && depStep.status === 'completed') ? STATUS_COLORS.completed : STATUS_COLORS.pending;
                    return {
                        id: `${depId}-${step.step_id}`,
                        from: depId,
                        to: step.step_id,
                        arrows: 'to',
                        color: edgeColor,
                    };
                })
            )
        );

        const data = { nodes, edges };
        const options = {
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'LR',
                    sortMethod: 'directed',
                    levelSeparation: 150,
                    nodeSpacing: 100,
                },
            },
            physics: { enabled: false },
            interaction: {
                dragNodes: false,
                dragView: true,
                zoomView: true,
                selectable: false,
            },
            nodes: {
                shape: 'box',
                borderWidth: 2,
                margin: 10,
                shapeProperties: {
                    borderRadius: 1,
                }
            },
            edges: {
                smooth: { type: 'cubicBezier', forceDirection: 'horizontal', roundness: 0.4 },
                width: 2,
            }
        };

        // If a network already exists, update its data. Otherwise, create a new one.
        if (networkRef.current) {
            networkRef.current.setData(data);
        } else {
            networkRef.current = new vis.Network(containerRef.current, data, options);
        }

        // Cleanup on unmount
        const networkInstance = networkRef.current;
        return () => {
            if (networkInstance) {
                // Delay destroy to avoid vis-network errors on fast re-renders
                setTimeout(() => {
                    try {
                        networkInstance.destroy();
                    } catch (e) {
                        // Suppress errors during cleanup
                    }
                }, 0);
                networkRef.current = null;
            }
        };
    }, [plan]); // Re-run whenever the plan prop changes

    if (plan.plan.length === 0) return null;

    return (
        <div ref={containerRef} className="h-28 w-full bg-background/50 rounded-sm border border-border/50 my-3" />
    );
};
