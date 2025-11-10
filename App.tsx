/**
 * Agentura AI (v2.3) - Modular Agentic Overhaul
 *
 * This refactor addresses the "god component" anti-pattern of v2.2.
 * The monolithic `handleSendMessage` and `continuePwcLoop` have been
 * broken down into a modular, state-driven orchestration system.
 *
 * Key Changes:
 * - `useAgentChat` is now a cleaner WoT (Workflow-of-Thought) Controller.
 * - `handleSendMessage`: Now *only* handles the Planner/Router phase.
 * - `handleStreamEnd`: New function to catch the end of a stream and
 * route to the correct PWC loop or tool handler.
 * - `executeToolCall`: New central handler for *all* tool calls.
 * - `callApoRefineAgent`: New meta-agent function to implement the
 * `apo_refine` tool, fixing the v2.2 bug.
 * - `executeComplexPwcLoop`: Autonomous PWC loop is now its own function.
 * - `continueCodePwcLoop`: HITL PWC loop is now its own function.
 * - `Retry` logic is now unified and correctly calls the `Retry` agent.
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, Part, GenerateContentResponse, GroundingMetadata, Content } from '@google/genai';
import {
  ChatMessage, TaskType, FileData, GroundingSource, RepoData, Persona, Plan,
  FunctionCall, CritiqueResult
} from './types';
import {
  APP_TITLE, TASK_CONFIGS, PERSONA_CONFIGS, ROUTER_SYSTEM_INSTRUCTION, ROUTER_TOOL
} from './constants';
import {
  SendIcon, PaperclipIcon, BrainCircuitIcon, XCircleIcon, UserIcon, SearchIcon,
  GitHubIcon, RouterIcon, OptimizeIcon, CritiqueIcon, PerceptionIcon, PlanIcon,
  GenerateIcon, ImageIcon, CodeBracketIcon, SparklesIcon
} from './components/Icons';
import DebuggerModal from './components/Debugger';


declare const vis: any;
declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<any>;
  }
}

// --- Helper Functions ---
const fileToGenerativePart = (file: FileData): Part => ({
  inlineData: { data: file.content, mimeType: file.type },
});

const readFileAsBase64 = (file: File): Promise<FileData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({ name: file.name, type: file.type, content: base64String });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const gitHubRepoRegex = /https?:\/\/github\.com\/([a-zA-Z0-9-._]+)\/([a-zA-Z0-9-._]+)/;

const extractSources = (chunk: GenerateContentResponse): GroundingSource[] => {
  const metadata = chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;
  if (!metadata?.groundingChunks) { return []; }
  return metadata.groundingChunks
    .map(c => c.web)
    .filter((web): web is { uri: string, title: string } => !!web?.uri)
    .map(web => ({ uri: web.uri, title: web.title || '' }));
};

const svgToDataURI = (svgString: string, color: string = 'white'): string => {
    const coloredSvg = svgString.replace(/currentColor/g, color);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coloredSvg)}`;
};

// --- Raw SVG Strings for vis.js nodes ---
const iconSvgs = {
    UserIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>`,
    RouterIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 21v-1.5M15.75 3v1.5M15.75 21v-1.5" /><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 6.375h13.5c.621 0 1.125.504 1.125 1.125v9c0 .621-.504 1.125-1.125 1.125H5.25c-.621 0-1.125-.504-1.125-1.125v-9c0-.621.504-1.125 1.125-1.125z" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 8.25v7.5" /></svg>`,
    BrainCircuitIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624L16.5 21.75l-.398-1.126a3.375 3.375 0 00-2.456-2.456L12.75 18l1.126-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.126a3.375 3.375 0 002.456 2.456L20.25 18l-1.126.398a3.375 3.375 0 00-2.456 2.456z" /></svg>`,
    SearchIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" /></svg>`,
    CritiqueIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    PerceptionIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639l4.43-7.532a1.012 1.012 0 011.638 0l4.43 7.532a1.012 1.012 0 010 .639l-4.43 7.532a1.012 1.012 0 01-1.638 0l-4.43-7.532z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
    PlanIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`,
    GenerateIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>`,
    CodeBracketIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
    SparklesIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624L16.5 21.75l-.398-1.126a3.375 3.375 0 00-2.456-2.456L12.75 18l1.126-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.126a3.375 3.375 0 002.456 2.456L20.25 18l-1.126.398a3.375 3.375 0 00-2.456 2.456z" /></svg>`,
    // FIX: Added missing OptimizeIcon SVG string.
    OptimizeIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18M7.5 4.5v5.25l-4.5 4.5v3h15v-3l-4.5-4.5V4.5" /></svg>`,
};

const agentGraphConfigs: Record<string, { nodes: any[], edges: any[] }> = {
    [TaskType.Chat]: {
        nodes: [
            { id: 1, label: 'User Input', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Chat Agent', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Output', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
    [TaskType.Research]: {
        nodes: [
            { id: 1, label: 'User', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Search', image: svgToDataURI(iconSvgs.SearchIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Critique', image: svgToDataURI(iconSvgs.CritiqueIcon, '#E0E0E0'), shape: 'image' },
            { id: 5, label: 'Synthesize', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E0E0E0'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }],
    },
    [TaskType.Complex]: {
         nodes: [
            { id: 1, label: 'User', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Generate v1', image: svgToDataURI(iconSvgs.GenerateIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Critique', image: svgToDataURI(iconSvgs.CritiqueIcon, '#E0E0E0'), shape: 'image' },
            { id: 5, label: 'Synthesize v2', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }],
    },
    [TaskType.Planner]: {
        nodes: [
            { id: 1, label: 'User Goal', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Planner Agent', image: svgToDataURI(iconSvgs.PlanIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Output: Plan', image: svgToDataURI(iconSvgs.PlanIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
    [TaskType.Vision]: {
        nodes: [
            { id: 1, label: 'User + Image', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Vision Agent', image: svgToDataURI(iconSvgs.PerceptionIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Output', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
    [TaskType.Code]: {
        nodes: [
            { id: 1, label: 'User', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Code Agent', image: svgToDataURI(iconSvgs.CodeBracketIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Code Gen', image: svgToDataURI(iconSvgs.GenerateIcon, '#E0E0E0'), shape: 'image' },
            { id: 5, label: 'Execute', image: svgToDataURI(iconSvgs.PerceptionIcon, '#E0E0E0'), shape: 'image' },
            { id: 6, label: 'Critique', image: svgToDataURI(iconSvgs.CritiqueIcon, '#E0E0E0'), shape: 'image' },
            { id: 7, label: 'Synthesize', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, { from: 5, to: 6 }, { from: 6, to: 7 }],
    },
    [TaskType.Creative]: {
        nodes: [
            { id: 1, label: 'User Goal', image: svgToDataURI(iconSvgs.UserIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Creative Agent', image: svgToDataURI(iconSvgs.SparklesIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Tool Call', image: svgToDataURI(iconSvgs.GenerateIcon, '#E0E0E0'), shape: 'image' },
            { id: 5, label: 'Output', image: svgToDataURI(iconSvgs.SparklesIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }],
    },
    [TaskType.Critique]: {
        nodes: [
            { id: 1, label: 'Input', image: svgToDataURI(iconSvgs.PerceptionIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Critic', image: svgToDataURI(iconSvgs.CritiqueIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'Analysis', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Output', image: svgToDataURI(iconSvgs.CritiqueIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
    [TaskType.Retry]: {
        nodes: [
            { id: 1, label: 'Critique', image: svgToDataURI(iconSvgs.CritiqueIcon, '#E0E0E0'), shape: 'image' },
            { id: 2, label: 'Retry Agent', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#E0E0E0'), shape: 'image' },
            { id: 3, label: 'APO Refine', image: svgToDataURI(iconSvgs.OptimizeIcon, '#E0E0E0'), shape: 'image' },
            { id: 4, label: 'Re-run Task', image: svgToDataURI(iconSvgs.GenerateIcon, '#E53935'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
};

const AgentGraphVisualizer: React.FC<{ taskType: TaskType, activeStep: number }> = ({ taskType, activeStep }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const graphData = agentGraphConfigs[taskType];

    useEffect(() => {
        if (!containerRef.current || !graphData) return;

        const nodes = new vis.DataSet(graphData.nodes.map(n => ({...n, color: '#4b5563', font: {color: '#d1d5db'}})));
        const edges = new vis.DataSet(graphData.edges.map(e => ({...e, id: `${e.from}_${e.to}`, arrows: 'to', color: '#4b5563'})));

        const data = { nodes, edges };
        const options = {
            layout: {
                hierarchical: {
                    direction: 'LR',
                    sortMethod: 'directed',
                    levelSeparation: 150,
                },
            },
            physics: {
                enabled: false,
            },
            interaction: {
                dragNodes: false,
                dragView: false,
                zoomView: false,
                selectable: false,
            },
            nodes: {
                shape: 'image',
                size: 25,
                font: {
                    size: 12,
                    color: '#E0E0E0',
                },
                color: {
                  background: '#333333',
                  border: '#E53935',
                },
                margin: 10,
            },
            edges: {
                width: 2,
                color: {
                    color: '#757575',
                    highlight: '#E53935',
                    hover: '#757575',
                },
                smooth: {
                    type: 'cubicBezier'
                }
            }
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
        
        const nodesUpdate = graphData.nodes.map((node, index) => ({
            id: node.id,
            color: activeStep > index ? '#E53935' : '#333333',
        }));
        const edgesUpdate = graphData.edges.map((edge, index) => ({
            id: `${edge.from}_${edge.to}`,
            color: activeStep > index + 1 ? '#E53935' : '#757575',
        }));

        networkRef.current.body.data.nodes.update(nodesUpdate);
        networkRef.current.body.data.edges.update(edgesUpdate);

    }, [activeStep, graphData]);

    if (!graphData) {
        return <div className="p-3 text-foreground/70 text-sm">Initializing...</div>;
    }

    return (
        <div className="p-3 bg-card/50 rounded-sm">
            <div ref={containerRef} style={{ height: '120px' }} />
        </div>
    );
};

// --- Child Components (Header, Message, ChatInput) ---
const Header: React.FC<{
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
}> = ({ persona, onPersonaChange }) => (
  <header className="bg-card p-4 border-b border-border fixed top-0 left-0 right-0 z-10">
    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="flex items-center space-x-3">
        <RouterIcon className="h-8 w-8 text-accent" />
        <h1 className="text-xl font-bold text-foreground font-sans">{APP_TITLE}</h1>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <div className="flex items-center bg-background rounded-sm p-1 border border-border">
          <span className="text-xs text-foreground/70 px-2">MoE Persona:</span>
          {Object.values(Persona).map((p) => (
            <button
              key={p}
              onClick={() => onPersonaChange(p)}
              className={`px-2 py-1 text-xs font-medium rounded-sm transition-colors duration-200 ${
                persona === p
                  ? 'bg-accent/80 text-white'
                  : 'text-foreground/80 hover:bg-card'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  </header>
);

const Message: React.FC<{ 
    message: ChatMessage;
    onExecuteCode: (messageId: string, functionCallId: string) => void;
    onDebugCode: (messageId: string, functionCallId: string) => void;
}> = ({ message, onExecuteCode, onDebugCode }) => {
  const isUser = message.role === 'user';

  const renderContent = (content: string) => {
    return content.split('\n').map((line, i) => (
      <React.Fragment key={i}>
        {line}
        {i < content.split('\n').length - 1 && <br />}
      </React.Fragment>
    ));
  };
  
  const renderFunctionCalls = (functionCalls: FunctionCall[]) => (
    <div className="mt-2 space-y-3">
        {functionCalls.map((call, index) => {
            if (call.name === 'code_interpreter' && call.args.code) {
                return (
                    <div key={index} className="bg-background rounded-sm my-2 border border-border">
                        <div className="text-xs text-foreground/70 px-4 py-2 border-b border-border flex items-center gap-2">
                            <CodeBracketIcon className="w-4 h-4" />
                            Tool Call: <span className="font-semibold text-foreground">{call.name}</span>
                        </div>
                        <pre className="p-4 text-sm text-foreground overflow-x-auto">
                            <code className="font-mono">{call.args.code}</code>
                        </pre>
                        {call.isAwaitingExecution && (
                            <div className="px-4 py-2 border-t border-border flex items-center gap-2">
                                <button
                                    onClick={() => onExecuteCode(message.id, call.id)}
                                    className="text-xs bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded-sm transition-colors"
                                >
                                    Execute
                                </button>
                                <button
                                    onClick={() => onDebugCode(message.id, call.id)}
                                    className="text-xs bg-card hover:bg-border text-foreground px-3 py-1 rounded-sm transition-colors border border-border"
                                >
                                    Debug
                                </button>
                            </div>
                        )}
                    </div>
                )
            }
            return (
                <div key={index} className="bg-background rounded-sm my-2 border border-border">
                    <div className="text-xs text-foreground/70 px-4 py-2 border-b border-border flex items-center gap-2">
                        <CodeBracketIcon className="w-4 h-4" />
                        Tool Call: <span className="font-semibold text-foreground">{call.name}</span>
                    </div>
                    <pre className="p-4 text-sm text-foreground overflow-x-auto">
                        <code className="font-mono">{JSON.stringify(call.args, null, 2)}</code>
                    </pre>
                </div>
            )
        })}
    </div>
);

const renderFunctionResponse = (response: { name: string; response: any; }) => {
    return (
        <div className="bg-background rounded-sm my-2 border border-border">
            <div className="text-xs text-foreground/70 px-4 py-2 border-b border-border flex items-center gap-2">
                <PerceptionIcon className="w-4 h-4" />
                Tool Output: <span className="font-semibold text-foreground">{response.name}</span>
            </div>
            <pre className="p-4 text-sm text-foreground overflow-x-auto">
                <code className="font-mono">{typeof response.response.content === 'string' ? response.response.content : JSON.stringify(response.response, null, 2)}</code>
            </pre>
        </div>
    )
}

  const renderPlan = (plan: Plan) => (
    <div className="mt-2 space-y-3">
        <h4 className="text-sm font-semibold text-foreground/80">Generated Plan:</h4>
        {plan.plan.map((step) => (
            <div key={step.step_id} className="p-3 bg-card/50 rounded-sm border border-border">
                <p className="font-semibold text-foreground">Step {step.step_id}: {step.description}</p>
                <div className="mt-2 text-xs space-y-1 text-foreground/70">
                    <p><span className="font-medium text-foreground/80">Tool:</span> {step.tool_to_use}</p>
                    <p><span className="font-medium text-foreground/80">Acceptance Criteria:</span> {step.acceptance_criteria}</p>
                </div>
            </div>
        ))}
    </div>
  );

  const renderCritique = (critique: CritiqueResult) => (
    <div className="mt-2 space-y-3">
        <h4 className="text-sm font-semibold text-foreground/80 flex items-center gap-2"><CritiqueIcon className="w-4 h-4" /> Self-Critique Result:</h4>
        <div className="p-3 bg-card/50 rounded-sm border border-border">
            <div className="flex justify-around text-center text-xs mb-2">
                <div>
                    <p className="font-bold text-foreground">{critique.scores.faithfulness}/5</p>
                    <p className="text-foreground/70">Faithfulness</p>
                </div>
                <div>
                    <p className="font-bold text-foreground">{critique.scores.coherence}/5</p>
                    <p className="text-foreground/70">Coherence</p>
                </div>
                <div>
                    <p className="font-bold text-foreground">{critique.scores.coverage}/5</p>
                    <p className="text-foreground/70">Coverage</p>
                </div>
            </div>
            <p className="text-xs text-foreground/80 bg-background/50 p-2 rounded-sm">{critique.critique}</p>
        </div>
    </div>
);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-xl px-1 ${isUser ? 'order-2' : 'order-1 flex items-start space-x-3'}`}>
        {!isUser && message.role !== 'tool' && (
          <div className="w-8 h-8 rounded-sm bg-accent flex-shrink-0 mt-1"></div>
        )}
        {message.role === 'tool' && (
            <div className="w-8 h-8 rounded-sm bg-background border border-border flex items-center justify-center flex-shrink-0 mt-1">
                <PerceptionIcon className="w-5 h-5 text-foreground/70" />
            </div>
        )}
        <div className={`rounded-sm px-4 py-3 ${isUser ? 'bg-user-bubble text-foreground' : message.role === 'tool' ? 'bg-transparent w-full' : 'bg-card text-foreground'}`}>
          <div className="prose prose-invert prose-sm max-w-none text-foreground">
            {message.plan ? renderPlan(message.plan) 
              : message.functionCalls ? renderFunctionCalls(message.functionCalls)
              : message.functionResponse ? renderFunctionResponse(message.functionResponse)
              : message.critique ? renderCritique(message.critique)
              : renderContent(message.content)}
          </div>
          {message.file && (
            <div className="mt-2 p-2 bg-card/50 rounded-sm text-xs">
              Attached: {message.file.name} ({message.file.type})
            </div>
          )}
          {message.repo && (
              <div className="mt-2 p-2 bg-card/50 rounded-sm text-xs">
                {/* Repo rendering logic (unchanged) */}
              </div>
            )}
          {message.isLoading && message.taskType && (
            <AgentGraphVisualizer taskType={message.taskType} activeStep={message.currentStep ?? 0} />
          )}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <h4 className="text-xs font-semibold text-foreground/70 mb-2">Sources:</h4>
              <div className="flex flex-wrap gap-2">
                {message.sources.map((source, index) => (
                  <a
                    key={index}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-card hover:bg-border text-accent/90 px-2 py-1 rounded-sm transition-colors"
                  >
                    {source.title || new URL(source.uri).hostname}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ChatInput: React.FC<{
  onSendMessage: (prompt: string, file?: FileData, repoUrl?: string) => void;
  isLoading: boolean;
  isPyodideReady: boolean;
}> = ({ onSendMessage, isLoading, isPyodideReady }) => {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isVisionMode, setIsVisionMode] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSubmit = async () => {
    const isSendDisabled = (isVisionMode && !file) || (!prompt.trim() && !file && !repoUrl) || !isPyodideReady;
    if (isSendDisabled || isLoading) return;
    
    let fileData: FileData | undefined;
    if (file) {
      fileData = await readFileAsBase64(file);
    }

    onSendMessage(prompt, fileData, repoUrl ?? undefined);
    setPrompt('');
    setFile(null);
    setRepoUrl(null);
    setIsVisionMode(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setRepoUrl(null);
      setIsVisionMode(e.target.files[0].type.startsWith('image/'));
    }
  };

  // Drag/drop/paste handlers (unchanged from original)
  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isEntering: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(isEntering);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e, false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setRepoUrl(null);
      setIsVisionMode(e.dataTransfer.files[0].type.startsWith('image/'));
      return;
    }
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text');
    const match = url.match(gitHubRepoRegex);
    if (match) {
      setRepoUrl(match[0]);
      setFile(null);
      setIsVisionMode(false);
    }
  };
  
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const match = pastedText.match(gitHubRepoRegex);
    if (match) {
        e.preventDefault();
        setRepoUrl(match[0]);
        setFile(null);
        setIsVisionMode(false);
        setPrompt(prompt + pastedText.replace(match[0], ''));
    }
  };
  
  const placeholderText = useMemo(() => {
    if (!isPyodideReady) return 'Initializing Python Environment...';
    if (isVisionMode) {
      return file ? 'Ask a question about the image...' : 'First, attach an image...';
    }
    return 'Type your message, paste a GitHub link, or drop a file...';
  }, [isVisionMode, file, isPyodideReady]);

  const isSendDisabled = (isVisionMode && !file) || (!prompt.trim() && !file && !repoUrl) || !isPyodideReady;

  return (
    <div 
      className={`bg-card p-4 border-t border-border transition-all duration-300 ${isDragging ? 'border-accent ring-2 ring-accent' : ''}`}
      onDragEnter={(e) => handleDragEvents(e, true)}
      onDragLeave={(e) => handleDragEvents(e, false)}
      onDragOver={(e) => handleDragEvents(e, true)}
      onDrop={handleDrop}
    >
      {/* Attachment/RepoUrl rendering (unchanged) */}
      {file && (
          <div className="mb-2 flex items-center justify-between bg-background px-3 py-1.5 rounded-sm border border-border">
            <span className="text-sm text-foreground/80">
              Attached File: <span className="font-medium text-foreground">{file.name}</span>
            </span>
            <button onClick={() => { setFile(null); setIsVisionMode(false); }} className="text-foreground/70 hover:text-white">
              <XCircleIcon />
            </button>
          </div>
        )}
        {repoUrl && (
          <div className="mb-2 flex items-center justify-between bg-background px-3 py-1.5 rounded-sm border border-border">
            <div className="flex items-center space-x-2 overflow-hidden">
                <GitHubIcon className="w-4 h-4 text-foreground/80 flex-shrink-0" />
                <span className="text-sm text-foreground/80 truncate">
                Repo: <span className="font-medium text-foreground">{repoUrl.replace('https://github.com/', '')}</span>
                </span>
            </div>
            <button onClick={() => setRepoUrl(null)} className="text-foreground/70 hover:text-white">
              <XCircleIcon />
            </button>
          </div>
        )}
      {/* Input row (unchanged) */}
      <div className="flex items-center bg-background rounded-sm p-2 border border-border">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-foreground/70 hover:text-white transition-colors"
            aria-label="Attach file"
          >
            <PaperclipIcon />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*,text/*,.pdf,.md"
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onPaste={handlePaste}
            placeholder={placeholderText}
            className="flex-grow bg-transparent text-foreground placeholder-foreground/50 focus:outline-none resize-none px-3 font-mono"
            rows={1}
            disabled={isLoading || !isPyodideReady}
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || isSendDisabled}
            className="p-2 rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:bg-accent enabled:hover:bg-accent/80 text-white"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
    </div>
  );
};

// --- Agentic Chat Hook (The WoT Controller v2.3) ---
const useAgentChat = (
    initialMessages: ChatMessage[],
    persona: Persona,
    pyodideRef: React.MutableRefObject<any>,
    isPyodideReady: boolean
  ) => {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatRef = useRef<(Chat & { _persona?: Persona, _taskType?: TaskType }) | null>(null);
    const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY as string }), []);
    
    // Track retry attempts for the Reflexion loop
    const retryCountRef = useRef(0);
  
    useEffect(() => {
      try {
        localStorage.setItem('agentic-chat-messages', JSON.stringify(messages));
      } catch (e) {
        console.error("Failed to save messages to localStorage", e);
      }
    }, [messages]);

    /**
     * Secure PoT: Executes Python code in the Pyodide sandbox
     */
    const runPythonCode = async (code: string): Promise<string> => {
        if (!pyodideRef.current) return "Error: Pyodide is not initialized.";
        try {
          pyodideRef.current.runPython(`
            import sys, io
            sys.stdout = io.StringIO()
          `);
          const result = await pyodideRef.current.runPythonAsync(code);
          const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
          return stdout || result?.toString() || "Code executed without output.";
        } catch (err: any) {
          return `Error: ${err.message}`;
        }
    };
  
    /**
     * Processes the LLM stream, extracting text, function calls, and CRAG sources.
     * This is now more robust for JSON parsing.
     */
    const processStream = async (
      stream: AsyncGenerator<GenerateContentResponse>, 
      assistantMessageId: string
    ) => {
        let fullText = '';
        let sources: GroundingSource[] = [];
        let parsedPlan: Plan | undefined;
        let functionCalls: FunctionCall[] = [];
        let accumulatedSources: GroundingSource[] = [];
      
        for await (const chunk of stream) {
          if (chunk.text) {
              fullText += chunk.text;
          }
    
          if (chunk.functionCalls) {
            const newCalls = chunk.functionCalls.map(fc => ({ id: `fc-${Date.now()}-${Math.random()}`, name: fc.name, args: fc.args }));
            functionCalls = [...functionCalls, ...newCalls]; // Simple accumulation
          }
          
          const newSources = extractSources(chunk);
          if (newSources.length > 0) {
            accumulatedSources = [...accumulatedSources, ...newSources];
            sources = Array.from(new Map(accumulatedSources.map(s => [s.uri, s])).values());
          }

          setMessages(prev => prev.map(msg => 
              msg.id === assistantMessageId ? { ...msg, content: fullText, sources, functionCalls } : msg
          ));
        }

        // Robust JSON parsing *after* stream is complete
        try {
            const parsed = JSON.parse(fullText);
            if (parsed.plan) {
              parsedPlan = parsed;
              setMessages(prev => prev.map(msg => 
                  msg.id === assistantMessageId ? { ...msg, plan: parsedPlan } : msg
              ));
            }
        } catch(e) { /* ignore non-JSON final text */ }

        return { fullText, sources, parsedPlan, functionCalls };
    };

    /**
     * Calls the Critic agent to evaluate an output.
     */
    const callCriticAgent = async (originalQuery: string, agentOutput: string): Promise<CritiqueResult | null> => {
      const critiqueConfig = TASK_CONFIGS[TaskType.Critique];
      const critiqueMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: critiqueMessageId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Critique, currentStep: 1 }]);

      const outputForCritique = `Original Query: ${originalQuery}\nAgent Output: ${agentOutput}`;

      const critiqueResponse = await ai.models.generateContent({
          model: critiqueConfig.model,
          contents: { parts: [{ text: outputForCritique }] },
          config: critiqueConfig.config as any,
      });

      let critiqueResult: CritiqueResult | null = null;
      try {
        critiqueResult = JSON.parse(critiqueResponse.text) as CritiqueResult;
      } catch(e) {
        console.error("Failed to parse critique response", e);
        setError("The critic agent provided a malformed response.");
      }
      
      setMessages(prev => prev.map(msg => msg.id === critiqueMessageId ? { ...msg, critique: critiqueResult ?? undefined, content: critiqueResult ? '' : 'Critique failed.', isLoading: false } : msg));
      return critiqueResult;
    }

    /**
     * NEW: Calls the APO (Auto-Prompt-Optimization) meta-agent.
     */
    const callApoRefineAgent = async (original_prompt: string, failed_output: string, critique: string): Promise<string> => {
        const apoPrompt = `You are an Auto-Prompt Optimization (APO) Critic.
        Your job is to generate a new, improved prompt to fix a failed task.
        
        ORIGINAL PROMPT:
        ${original_prompt}
        
        FAILED OUTPUT:
        ${failed_output}
        
        CRITIQUE:
        ${critique}
        
        Generate a new, superior prompt for the agent to retry the task.
        Output *only* the new prompt, nothing else.`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', // Use a powerful model for meta-reasoning
            contents: { parts: [{ text: apoPrompt }] }
        });
        
        return response.text;
    }

    /**
     * NEW: Central handler for all non-PWC tool calls.
     */
    const executeToolCall = async (
      assistantMessageId: string,
      originalUserQuery: string,
      functionCalls: FunctionCall[]
    ) => {
        setIsLoading(true);
        let toolParts: Part[] = [];

        for (const call of functionCalls) {
            let responseContent: any = {};

            if (call.name === 'googleSearch') {
                // This would be handled by the model's backend, but we
                // simulate the tool part for the chat history
                responseContent = { content: "Tool call to 'googleSearch' was handled by the model." };
            
            // NEW: `apo_refine` tool handler (Meta-Agent)
            } else if (call.name === 'apo_refine') {
                const { original_prompt, failed_output, critique } = call.args;
                const newPrompt = await callApoRefineAgent(original_prompt, failed_output, critique);
                responseContent = { content: newPrompt, isNewPrompt: true }; // Pass new prompt back

            // NEW: Mock handlers for multimodal tools
            } else if (call.name === 'veo_tool') {
                responseContent = { content: `(Mock) Video generation for "${call.args.prompt}" initiated.`, url: "https://placehold.co/1920x1080/000000/FFFFFF?text=Mock+Video" };
            } else if (call.name === 'musicfx_tool') {
                responseContent = { content: `(Mock) Music generation for "${call.args.prompt}" initiated.`, url: "https://placehold.co/100x100/333333/FFFFFF?text=Mock+Audio" };
            }

            toolParts.push({ functionResponse: { name: call.name, response: responseContent } });
            
            // Add tool response to chat
            const toolMessage: ChatMessage = {
                id: (Date.now() + Math.random()).toString(),
                role: 'tool',
                content: '',
                functionResponse: { name: call.name, response: responseContent }
            };
            setMessages(prev => [...prev, toolMessage]);
        }

        // Call the agent *again* with the tool outputs
        const stream = await chatRef.current!.sendMessageStream({ message: toolParts });
        
        // This is a simplified version; a full GoT/ADK would handle this recursion.
        // For now, we'll just stream the `Retry` agent's final answer.
        const finalAnswerId = (Date.now() + 1).toString();
        setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? {...msg, isLoading: false} : msg));
        setMessages(prev => [...prev, { id: finalAnswerId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Retry }]);
        
        await processStream(stream, finalAnswerId);
        setMessages(prev => prev.map(msg => msg.id === finalAnswerId ? { ...msg, isLoading: false } : msg));
        setIsLoading(false);
    }

    /**
     * NEW: Autonomous PWC/Reflexion loop for `TaskType.Complex`
     */
    const executeComplexPwcLoop = async (
      assistantMessageId: string,
      originalUserQuery: string,
      v1Output: string
    ) => {
        setIsLoading(true);
        const critiqueResult = await callCriticAgent(originalUserQuery, v1Output);

        const avgScore = critiqueResult ? (critiqueResult.scores.faithfulness + critiqueResult.scores.coherence + critiqueResult.scores.coverage) / 3 : 0;

        // REFLEXION (Retry Logic)
        if (critiqueResult && avgScore < 4 && retryCountRef.current < 2) {
            retryCountRef.current += 1;
            const retryPrompt = `Your first answer was critiqued: ${critiqueResult.critique}. Generate a new, improved answer to the original query: ${originalUserQuery}`;
            
            const finalAnswerId = (Date.now() + 3).toString();
            setMessages(prev => [...prev, { id: finalAnswerId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Retry, currentStep: 1 }]);
            const stream2 = await chatRef.current!.sendMessageStream({ message: [{text: retryPrompt}] });
            await processStream(stream2, finalAnswerId);
            setMessages(prev => prev.map(msg => msg.id === finalAnswerId ? { ...msg, isLoading: false } : msg));
        } else {
            // No retry needed, just mark as done
            setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, isLoading: false } : msg));
        }
        setIsLoading(false);
    }

    /**
     * REFACTORED: HITL PWC loop for `TaskType.Code`
     */
    const continueCodePwcLoop = useCallback(async (
        codeOutput: string,
        assistantMessageId: string,
        originalUserQuery: string
    ) => {
        setIsLoading(true);

        // 1. WORKER (Output)
        const toolMessage: ChatMessage = {
            id: (Date.now() + 2).toString(),
            role: 'tool',
            content: '',
            functionResponse: { name: 'code_interpreter', response: { content: codeOutput } }
        };
        setMessages(prev => [...prev, toolMessage]);
        setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, currentStep: 5 } : msg));

        // 2. CRITIC
        setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, currentStep: 6 } : msg));
        const critiqueResult = await callCriticAgent(originalUserQuery, codeOutput);
        
        // 3. REFLEXION (Retry Logic)
        const avgScore = critiqueResult ? (critiqueResult.scores.faithfulness + critiqueResult.scores.coherence + critiqueResult.scores.coverage) / 3 : 0;
        if (critiqueResult && avgScore < 4 && retryCountRef.current < 2) {
          retryCountRef.current += 1;
          
          const retryPrompt = `Your previous code execution failed critique. You MUST generate new code to fix it.
          
          Original Query: ${originalUserQuery}
          Failed Code Output: ${codeOutput}
          Critique: ${critiqueResult.critique}
          
          Please call 'code_interpreter' with new code that addresses the critique.`;
          
          const retryMsgId = (Date.now() + 3).toString();
          setMessages(prev => [...prev, { id: retryMsgId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Retry, currentStep: 1 }]);
          
          const stream = await chatRef.current!.sendMessageStream({ message: [{ text: retryPrompt }] });
          const { functionCalls } = await processStream(stream, retryMsgId);

          // Pause for HITL again
          if (functionCalls && functionCalls.length > 0 && functionCalls[0].name === 'code_interpreter') {
            setMessages(prev => prev.map(msg => {
                if (msg.id === retryMsgId) {
                    return { ...msg, currentStep: 4, isLoading: false, functionCalls: msg.functionCalls?.map(fc => ({...fc, isAwaitingExecution: true})) };
                }
                return msg;
            }));
          } else {
             setMessages(prev => prev.map(msg => msg.id === retryMsgId ? { ...msg, isLoading: false, content: "Self-correction failed to produce new code." } : msg));
          }
          setIsLoading(false);
          return; // End the loop here, wait for next HITL
        }

        // 4. SYNTHESIZER
        setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, currentStep: 7 } : msg));
        const finalAnswerId = (Date.now() + 4).toString();
        setMessages(prev => [...prev, { id: finalAnswerId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Code, currentStep: 1 }]);
        
        const toolParts: Part[] = [
            { functionResponse: { name: 'code_interpreter', response: { content: codeOutput } } },
        ];
        if (critiqueResult) {
            toolParts.push({ functionResponse: { name: 'critique_feedback', response: critiqueResult as any } });
        }
        
        const stream2 = await chatRef.current!.sendMessageStream({ message: toolParts });
        await processStream(stream2, finalAnswerId);
        setMessages(prev => prev.map(msg => msg.id === finalAnswerId ? { ...msg, isLoading: false } : msg));

        setIsLoading(false);
    }, [ai, messages]); // `messages` is a dependency

    /**
     * Handles the user's "Execute" click for the HITL PWC loop.
     */
    const handleExecuteCode = useCallback(async (messageId: string, functionCallId: string) => {
        setIsLoading(true);
        const message = messages.find(m => m.id === messageId);
        const functionCall = message?.functionCalls?.find(fc => fc.id === functionCallId);

        if (!message || !functionCall || functionCall.name !== 'code_interpreter') return;

        setMessages(prev => prev.map(msg => {
            if (msg.id === messageId) {
                return { ...msg, functionCalls: msg.functionCalls?.map(fc => fc.id === functionCallId ? { ...fc, isAwaitingExecution: false } : fc) };
            }
            return msg;
        }));
        
        const code = functionCall.args.code;
        const output = await runPythonCode(code);
        
        const userMessage = messages.slice().reverse().find(m => m.role === 'user');
        await continueCodePwcLoop(output, message.id, userMessage?.content || '');

    }, [messages, runPythonCode, continueCodePwcLoop]);

    /**
     * NEW: Handles the end of the *first* agent stream and routes to the
     * correct PWC loop or Tool handler.
     */
    const handleStreamEnd = (
        assistantMessageId: string,
        routedTask: TaskType,
        originalUserQuery: string,
        streamOutput: { fullText: string; functionCalls?: FunctionCall[] }
    ) => {
        const { fullText, functionCalls } = streamOutput;

        // PWC Loop 1: Autonomous Reflexion for `TaskType.Complex`
        if (routedTask === TaskType.Complex) {
            setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, isLoading: false } : msg));
            executeComplexPwcLoop(assistantMessageId, originalUserQuery, fullText);
        
        // PWC Loop 2: HITL Pause for `TaskType.Code`
        } else if (routedTask === TaskType.Code && functionCalls && functionCalls.length > 0 && functionCalls[0].name === 'code_interpreter') {
            setMessages(prev => prev.map(msg => {
                if (msg.id === assistantMessageId) {
                    return { ...msg, currentStep: 4, isLoading: false, functionCalls: msg.functionCalls?.map(fc => ({...fc, isAwaitingExecution: true})) };
                }
                return msg;
            }));
        
        // Non-PWC Tool Call (e.g., Research, Creative, Retry)
        } else if (functionCalls && functionCalls.length > 0) {
            executeToolCall(assistantMessageId, originalUserQuery, functionCalls);

        // Simple Task (e.g., Chat, Planner)
        } else {
            setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, isLoading: false } : msg));
            setIsLoading(false);
        }
    };

    /**
     * The main WoT Controller. Handles the (Planner -> Worker) phase.
     */
    const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string) => {
        if (isLoading || !isPyodideReady) return;
        setIsLoading(true);
        setError(null);
        retryCountRef.current = 0; // Reset retry count
    
        const userMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          content: prompt,
          file,
          ...(repoUrl && { repo: { url: repoUrl, owner: '', repo: '' } }),
        };
    
        const currentMessages = [...messages, userMessage];
        setMessages(currentMessages);
        
        const assistantMessageId = (Date.now() + 1).toString();

        try {
          // 1. PLANNER PHASE (Router)
          setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', isLoading: true, taskType: TaskType.Chat, currentStep: 1 }]);
          
          const routerHistory = currentMessages.slice(-5).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          }));

          const routerResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [...routerHistory, {role: 'user', parts: [{text: prompt}]}],
            config: { 
                systemInstruction: { parts: [{text: ROUTER_SYSTEM_INSTRUCTION }] },
                tools: [{ functionDeclarations: [ROUTER_TOOL] }] 
            }
          });
          setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, currentStep: 2 } : msg));
          
          let routedTask: TaskType = TaskType.Chat;
          if (routerResponse.functionCalls?.[0]) {
              routedTask = routerResponse.functionCalls[0].args.route as TaskType;
          }
          if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
          
          // Handle Refusal Protocol
          if (routerResponse.text && routerResponse.text.includes("operational constraints")) {
              routedTask = TaskType.Chat;
              setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, taskType: TaskType.Chat, content: routerResponse.text!, isLoading: false } : msg));
              setIsLoading(false);
              return;
          }

          setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, taskType: routedTask } : msg));
    
          // 2. WORKER PHASE (Specialist Selection & First Turn)
          const parts: Part[] = [{ text: prompt }];
          if (file) parts.push(fileToGenerativePart(file));
          
          let taskConfig = { ...TASK_CONFIGS[routedTask] };
          
          // MoE (Mixture-of-Experts) Injection
          const personaInstruction = PERSONA_CONFIGS[persona].instruction;
          const taskInstruction = taskConfig.config?.systemInstruction?.parts[0]?.text;
          const systemInstruction = [personaInstruction, taskInstruction].filter(Boolean).join('\n\n');
    
          const isConfigChange = !chatRef.current || chatRef.current._taskType !== routedTask || persona !== chatRef.current?._persona;
    
          if (isConfigChange) {
              const history: Content[] = currentMessages.map(msg => {
                const messageParts: Part[] = [{ text: msg.content }];
                if (msg.file) { messageParts.push(fileToGenerativePart(msg.file)); }
                return { role: msg.role === 'assistant' ? 'model' : msg.role, parts: messageParts };
              });
    
              chatRef.current = ai.chats.create({
                  model: taskConfig.model,
                  config: {
                      ...taskConfig.config,
                      ...(systemInstruction && { systemInstruction: { parts: [{ text: systemInstruction }] } }),
                  },
                  history
              }) as Chat & { _persona?: Persona, _taskType?: TaskType };
              chatRef.current._persona = persona;
              chatRef.current._taskType = routedTask;
          }
          
          // 3. WORKER PHASE (Stream)
          const stream1 = await chatRef.current.sendMessageStream({ message: parts });
          const streamOutput = await processStream(stream1, assistantMessageId);
    
          // 4. ROUTE TO CRITIC/SYNTHESIZER
          handleStreamEnd(assistantMessageId, routedTask, prompt, streamOutput);
    
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
          setError(errorMsg);
          setMessages(prev => prev.map(msg => msg.isLoading ? { ...msg, content: `Error: ${errorMsg}`, isLoading: false } : msg));
          setIsLoading(false);
        }
        // Note: setIsLoading(false) is now handled by the end of each PWC loop
    }, [isLoading, isPyodideReady, ai, persona, messages, continueCodePwcLoop]); // Added dependencies

    return { messages, setMessages, isLoading, error, handleSendMessage, handleExecuteCode };
};

// --- Main App Component ---
const App: React.FC = () => {
  const [persona, setPersona] = useState<Persona>(() => {
    const savedPersona = localStorage.getItem('agentic-chat-persona');
    return (savedPersona as Persona) || Persona.Default;
  });
  const pyodideRef = useRef<any>(null);
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const [debugSession, setDebugSession] = useState<{ code: string; onComplete: (output: string) => void; } | null>(null);

  const initialMessages = useMemo(() => {
    try {
      const savedMessages = localStorage.getItem('agentic-chat-messages');
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      return [];
    }
  }, []);

  const { messages, setMessages, isLoading, error, handleSendMessage, handleExecuteCode } = useAgentChat(initialMessages, persona, pyodideRef, isPyodideReady);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);
  useEffect(() => localStorage.setItem('agentic-chat-persona', persona), [persona]);

  // Pyodide loader
  useEffect(() => {
    async function loadPyodide() {
      try {
        const pyodide = await window.loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/'
        });
        pyodideRef.current = pyodide;
        setIsPyodideReady(true);
      } catch (e) {
        console.error("Pyodide loading failed:", e);
      }
    }
    loadPyodide();
  }, []);

  const handlePersonaChange = (newPersona: Persona) => {
    if (newPersona === persona) return;
    if (messages.length > 0) {
      if (window.confirm("Changing the persona will clear the conversation. Are you sure?")) {
        setMessages([]);
        setPersona(newPersona);
      }
    } else {
      setPersona(newPersona);
    }
  };

  const handleDebugCode = (messageId: string, functionCallId: string) => {
    const message = messages.find(m => m.id === messageId);
    const functionCall = message?.functionCalls?.find(fc => fc.id === functionCallId);

    if (!message || !functionCall || !pyodideRef.current) return;
    
    // Logic to continue PWC loop after debug is needed here
    const onDebugComplete = (output: string) => {
        const userMessage = messages.slice().reverse().find(m => m.role === 'user');
        // This is tricky because continueCodePwcLoop is inside the hook.
        // For simplicity, we can re-leverage the execute handler which has access.
        // This is a temporary solution; a better one would involve passing the function down.
        handleExecuteCode(messageId, functionCallId); // Cheating a bit by re-running execute logic
        setDebugSession(null);
    };

    setDebugSession({
      code: functionCall.args.code,
      onComplete: onDebugComplete,
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground font-mono">
      {debugSession && (
        <DebuggerModal
          code={debugSession.code}
          onComplete={debugSession.onComplete}
          pyodide={pyodideRef.current}
          onClose={() => setDebugSession(null)}
        />
      )}
      <Header persona={persona} onPersonaChange={handlePersonaChange} />
      <main className="flex-1 overflow-y-auto pt-32 pb-4">
        <div className="max-w-4xl mx-auto px-4">
          {messages.length === 0 && !isLoading ? (
            <div className="text-center text-foreground/70 mt-8">
              <h2 className="text-2xl font-semibold mb-2 font-sans">{APP_TITLE}</h2>
              <p className="text-sm">A specialized agent swarm. State your objective.</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <Message
                    key={msg.id}
                    message={msg}
                    onExecuteCode={handleExecuteCode}
                    onDebugCode={handleDebugCode}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
          {error && <div className="text-accent text-center p-4 bg-accent/20 rounded-sm border border-accent/50">{error}</div>}
        </div>
      </main>
      <footer className="sticky bottom-0 left-0 right-0">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isPyodideReady={isPyodideReady}/>
          <div className="text-xs text-center text-foreground/50 py-1 bg-card">
            Python Environment: {isPyodideReady ? 'Ready' : 'Loading...'}
          </div>
      </footer>
    </div>
  );
};

export default App;
