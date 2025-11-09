
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { GoogleGenAI, Chat, Part, GenerateContentResponse, GroundingMetadata, FunctionDeclaration, Content } from '@google/genai';
import { ChatMessage, TaskType, FileData, GroundingSource, RepoData, Persona, Plan, FunctionCall } from './types';
import { APP_TITLE, TASK_CONFIGS, PERSONA_CONFIGS, ROUTER_TOOL } from './constants';
import { SendIcon, PaperclipIcon, BrainCircuitIcon, XCircleIcon, UserIcon, SearchIcon, GitHubIcon, RouterIcon, OptimizeIcon, CritiqueIcon, PerceptionIcon, PlanIcon, GenerateIcon, ImageIcon, CodeBracketIcon, SparklesIcon } from './components/Icons';

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
    OptimizeIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18M7.5 4.5v5.25l-4.5 4.5v3h15v-3l-4.5-4.5V4.5" /></svg>`,
    CritiqueIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
    PerceptionIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639l4.43-7.532a1.012 1.012 0 011.638 0l4.43 7.532a1.012 1.012 0 010 .639l-4.43 7.532a1.012 1.012 0 01-1.638 0l-4.43-7.532z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`,
    PlanIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`,
    GenerateIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" /></svg>`,
    ImageIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>`,
    CodeBracketIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>`,
    SparklesIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.624L16.5 21.75l-.398-1.126a3.375 3.375 0 00-2.456-2.456L12.75 18l1.126-.398a3.375 3.375 0 002.456-2.456L16.5 14.25l.398 1.126a3.375 3.375 0 002.456 2.456L20.25 18l-1.126.398a3.375 3.375 0 00-2.456 2.456z" /></svg>`,
};

// --- Child Components ---
const agentGraphConfigs: Record<TaskType, { nodes: any[], edges: any[] }> = {
    [TaskType.Chat]: {
        nodes: [
            { id: 1, label: 'User Input', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Chat Agent', image: svgToDataURI(iconSvgs.BrainCircuitIcon), shape: 'image' },
            { id: 4, label: 'Output', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
    [TaskType.Research]: {
        nodes: [
            { id: 1, label: 'User Input', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Perception', image: svgToDataURI(iconSvgs.PerceptionIcon), shape: 'image' },
            { id: 4, label: 'Research Agent', image: svgToDataURI(iconSvgs.BrainCircuitIcon), shape: 'image' },
            { id: 5, label: 'Action: Search', image: svgToDataURI(iconSvgs.SearchIcon), shape: 'image' },
            { id: 6, label: 'Reasoning', image: svgToDataURI(iconSvgs.BrainCircuitIcon), shape: 'image' },
            { id: 7, label: 'Output', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, { from: 5, to: 6 }, { from: 6, to: 7 }],
    },
    [TaskType.Complex]: {
        nodes: [
            { id: 1, label: 'User Input', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Perception', image: svgToDataURI(iconSvgs.PerceptionIcon), shape: 'image' },
            { id: 4, label: 'Query Optimizer', image: svgToDataURI(iconSvgs.OptimizeIcon), shape: 'image' },
            { id: 5, label: 'Thinking', image: svgToDataURI(iconSvgs.BrainCircuitIcon), shape: 'image' },
            { id: 6, label: 'Self-Critique', image: svgToDataURI(iconSvgs.CritiqueIcon), shape: 'image' },
            { id: 7, label: 'Output', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, { from: 5, to: 6 }, { from: 6, to: 7 }],
    },
    [TaskType.Planner]: {
        nodes: [
            { id: 1, label: 'User Goal', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Planner Agent', image: svgToDataURI(iconSvgs.PlanIcon), shape: 'image' },
            { id: 4, label: 'Plan Generation', image: svgToDataURI(iconSvgs.GenerateIcon), shape: 'image' },
            { id: 5, label: 'Output: Plan', image: svgToDataURI(iconSvgs.PlanIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }],
    },
    [TaskType.Vision]: {
        nodes: [
            { id: 1, label: 'User Input + Image', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Vision Agent', image: svgToDataURI(iconSvgs.ImageIcon), shape: 'image' },
            { id: 4, label: 'Output', image: svgToDataURI(iconSvgs.BrainCircuitIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }],
    },
    [TaskType.Code]: {
        nodes: [
            { id: 1, label: 'User Input', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Code Agent', image: svgToDataURI(iconSvgs.CodeBracketIcon), shape: 'image' },
            { id: 4, label: 'PoT: Code Gen', image: svgToDataURI(iconSvgs.GenerateIcon), shape: 'image' },
            { id: 5, label: 'Execute & Observe', image: svgToDataURI(iconSvgs.PerceptionIcon), shape: 'image' },
            { id: 6, label: 'Output: Result', image: svgToDataURI(iconSvgs.CodeBracketIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }, { from: 5, to: 6 }],
    },
    [TaskType.Creative]: {
        nodes: [
            { id: 1, label: 'User Goal', image: svgToDataURI(iconSvgs.UserIcon), shape: 'image' },
            { id: 2, label: 'Router', image: svgToDataURI(iconSvgs.RouterIcon), shape: 'image' },
            { id: 3, label: 'Creative Agent', image: svgToDataURI(iconSvgs.SparklesIcon), shape: 'image' },
            { id: 4, label: 'Orchestration', image: svgToDataURI(iconSvgs.GenerateIcon), shape: 'image' },
            { id: 5, label: 'Output: Plan', image: svgToDataURI(iconSvgs.SparklesIcon, '#67e8f9'), shape: 'image' },
        ],
        edges: [{ from: 1, to: 2 }, { from: 2, to: 3 }, { from: 3, to: 4 }, { from: 4, to: 5 }],
    },
};

const AgentGraphVisualizer: React.FC<{ taskType: TaskType }> = ({ taskType }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const networkRef = useRef<any>(null);
    const [activeStep, setActiveStep] = useState(0);

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
                    color: '#d1d5db',
                },
                color: {
                  background: '#374151',
                  border: '#4b5563',
                },
                margin: 10,
            },
            edges: {
                width: 2,
                color: {
                    color: '#4b5563',
                    highlight: '#3b82f6',
                    hover: '#4b5563',
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
        if (!graphData) return;
        setActiveStep(0);
        const timer = setInterval(() => {
            setActiveStep(s => {
                if (s >= graphData.nodes.length) {
                    clearInterval(timer);
                    return s;
                }
                return s + 1;
            });
        }, 800);
        return () => clearInterval(timer);
    }, [taskType, graphData]);

    useEffect(() => {
        if (!networkRef.current || !graphData) return;
        
        const nodesUpdate = graphData.nodes.map((node, index) => ({
            id: node.id,
            color: activeStep > index ? '#2563eb' : '#4b5563',
        }));
        const edgesUpdate = graphData.edges.map((edge, index) => ({
            id: `${edge.from}_${edge.to}`, // visjs needs edge ids for updates
            color: activeStep > index + 1 ? '#2563eb' : '#4b5563',
        }));

        networkRef.current.body.data.nodes.update(nodesUpdate);
        networkRef.current.body.data.edges.update(edgesUpdate);

    }, [activeStep, graphData]);

    if (!graphData) {
        return <div className="p-3 text-gray-400 text-sm">Initializing...</div>;
    }

    return (
        <div className="p-3 bg-gray-700/50 rounded-lg">
            <div ref={containerRef} style={{ height: '120px' }} />
        </div>
    );
};

const Header: React.FC<{
  persona: Persona;
  onPersonaChange: (persona: Persona) => void;
}> = ({ persona, onPersonaChange }) => (
  <header className="bg-gray-800/50 backdrop-blur-sm p-4 border-b border-gray-700 fixed top-0 left-0 right-0 z-10">
    <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
      <div className="flex items-center space-x-3">
        <BrainCircuitIcon className="h-8 w-8 text-cyan-400" />
        <h1 className="text-xl font-bold text-gray-100">{APP_TITLE}</h1>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <div className="flex items-center bg-gray-900 rounded-lg p-1">
          <span className="text-xs text-gray-400 px-2">Persona:</span>
          {Object.values(Persona).map((p) => (
            <button
              key={p}
              onClick={() => onPersonaChange(p)}
              className={`px-2 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${
                persona === p
                  ? 'bg-blue-600/70 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
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

const Message: React.FC<{ message: ChatMessage }> = ({ message }) => {
  const isUser = message.role === 'user';

  const renderContent = (content: string) => {
    // Special formatting for observation messages
    if (content.startsWith('Observation:\n')) {
        return (
            <div>
                <div className="text-xs text-gray-400 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                    <PerceptionIcon className="w-4 h-4" />
                    Observation
                </div>
                <pre className="p-4 text-sm text-gray-200 overflow-x-auto">
                    <code>{content.replace('Observation:\n', '')}</code>
                </pre>
            </div>
        );
    }
    const parts = content.split(/(\n)/);
    return parts.map((part, index) =>
      part === '\n' ? <br key={index} /> : <span key={index}>{part}</span>
    );
  };
  
  const renderFunctionCalls = (functionCalls: FunctionCall[]) => (
    <div className="mt-2 space-y-3">
        {functionCalls.map((call, index) => {
            // Custom renderer for code_interpreter
            if (call.name === 'code_interpreter' && call.args.code) {
                return (
                    <div key={index} className="bg-gray-900 rounded-md my-2">
                        <div className="text-xs text-gray-400 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                            <CodeBracketIcon className="w-4 h-4" />
                            Tool Call: <span className="font-semibold text-gray-200">code_interpreter</span>
                        </div>
                        <pre className="p-4 text-sm text-gray-200 overflow-x-auto">
                            <code>{call.args.code}</code>
                        </pre>
                    </div>
                )
            }
            // Default renderer for other function calls
            return (
                <div key={index} className="bg-gray-900 rounded-md my-2">
                    <div className="text-xs text-gray-400 px-4 py-2 border-b border-gray-700 flex items-center gap-2">
                        <CodeBracketIcon className="w-4 h-4" />
                        Tool Call: <span className="font-semibold text-gray-200">{call.name}</span>
                    </div>
                    <pre className="p-4 text-sm text-gray-200 overflow-x-auto">
                        <code>{JSON.stringify(call.args, null, 2)}</code>
                    </pre>
                </div>
            )
        })}
    </div>
);


  const renderPlan = (plan: Plan) => (
    <div className="mt-2 space-y-3">
        <h4 className="text-sm font-semibold text-gray-300">Generated Plan:</h4>
        {plan.plan.map((step) => (
            <div key={step.step_id} className="p-3 bg-gray-600/50 rounded-md">
                <p className="font-semibold text-gray-200">Step {step.step_id}: {step.description}</p>
                <div className="mt-2 text-xs space-y-1 text-gray-400">
                    <p><span className="font-medium text-gray-300">Tool:</span> {step.tool_to_use}</p>
                    <p><span className="font-medium text-gray-300">Acceptance Criteria:</span> {step.acceptance_criteria}</p>
                </div>
            </div>
        ))}
    </div>
);

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-xl px-1 ${isUser ? 'order-2' : 'order-1 flex items-start space-x-3'}`}>
        {!isUser && (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex-shrink-0 mt-1"></div>
        )}
        <div className={`rounded-lg px-4 py-3 ${isUser ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
          <div className="prose prose-invert prose-sm max-w-none">
            {message.plan ? renderPlan(message.plan) 
              : message.functionCalls ? renderFunctionCalls(message.functionCalls)
              : renderContent(message.content)}
          </div>
          {message.file && (
            <div className="mt-2 p-2 bg-gray-600/50 rounded-md text-xs">
              Attached: {message.file.name} ({message.file.type})
            </div>
          )}
          {message.repo && (
              <div className="mt-2 p-2 bg-gray-600/50 rounded-md text-xs">
                <div className="flex items-center space-x-2">
                  <GitHubIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <a href={message.repo.url} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline truncate">
                    Attached Repo: {message.repo.owner}/{message.repo.repo}
                  </a>
                </div>
                {message.repo.fileTree && isUser && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-gray-400">View File Tree</summary>
                    <pre className="mt-1 p-2 bg-gray-900/50 rounded-sm text-gray-300 text-xs overflow-auto max-h-40">
                      <code>{message.repo.fileTree}</code>
                    </pre>
                  </details>
                )}
                {message.repo.error && (
                   <p className="mt-1 text-red-400">Error: {message.repo.error}</p>
                )}
              </div>
            )}
          {message.isLoading && message.taskType && <div className="mt-2 w-full"><AgentGraphVisualizer taskType={message.taskType} /></div>}
          {message.sources && message.sources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-600/50">
              <h4 className="text-xs font-semibold text-gray-400 mb-2">Sources:</h4>
              <div className="flex flex-wrap gap-2">
                {message.sources.map((source, index) => (
                  <a
                    key={index}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-gray-600 hover:bg-gray-500 text-cyan-300 px-2 py-1 rounded-md transition-colors"
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
      className={`bg-gray-800 p-4 border-t border-gray-700 transition-all duration-300 ${isDragging ? 'border-blue-500 ring-2 ring-blue-500' : ''}`}
      onDragEnter={(e) => handleDragEvents(e, true)}
      onDragLeave={(e) => handleDragEvents(e, false)}
      onDragOver={(e) => handleDragEvents(e, true)}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 bg-blue-500/10 flex items-center justify-center">
            <p className="text-blue-400 font-semibold">Drop file or GitHub repository link</p>
        </div>
      )}
      <div className="max-w-4xl mx-auto">
        {file && (
          <div className="mb-2 flex items-center justify-between bg-gray-700 px-3 py-1.5 rounded-md">
            <span className="text-sm text-gray-300">
              Attached File: <span className="font-medium text-gray-100">{file.name}</span>
            </span>
            <button onClick={() => { setFile(null); setIsVisionMode(false); }} className="text-gray-400 hover:text-white">
              <XCircleIcon />
            </button>
          </div>
        )}
        {repoUrl && (
          <div className="mb-2 flex items-center justify-between bg-gray-700 px-3 py-1.5 rounded-md">
            <div className="flex items-center space-x-2 overflow-hidden">
                <GitHubIcon className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-300 truncate">
                Repo: <span className="font-medium text-gray-100">{repoUrl.replace('https://github.com/', '')}</span>
                </span>
            </div>
            <button onClick={() => setRepoUrl(null)} className="text-gray-400 hover:text-white">
              <XCircleIcon />
            </button>
          </div>
        )}
        <div className="flex items-center bg-gray-900 rounded-lg p-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-white transition-colors"
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
            className="flex-grow bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none resize-none px-3"
            rows={1}
            disabled={isLoading || !isPyodideReady}
          />
          <button
            onClick={handleSubmit}
            disabled={isLoading || isSendDisabled}
            className="p-2 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed enabled:bg-blue-600 enabled:hover:bg-blue-700 text-white"
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
const App: React.FC = () => {
  const [persona, setPersona] = useState<Persona>(() => {
    const savedPersona = localStorage.getItem('agentic-chat-persona');
    return (savedPersona as Persona) || Persona.Default;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const savedMessages = localStorage.getItem('agentic-chat-messages');
      return savedMessages ? JSON.parse(savedMessages) : [];
    } catch (e) {
      console.error("Failed to parse messages from localStorage", e);
      return [];
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPyodideReady, setIsPyodideReady] = useState(false);
  const pyodideRef = useRef<any>(null);
  const chatRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  // Load Pyodide on mount
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
        setError("Failed to load Python environment.");
      }
    }
    loadPyodide();
  }, []);

  const runPythonCode = async (code: string): Promise<string> => {
    if (!pyodideRef.current) return "Error: Pyodide is not initialized.";
    try {
      // Redirect stdout
      pyodideRef.current.runPython(`
        import sys
        import io
        sys.stdout = io.StringIO()
      `);
      const result = await pyodideRef.current.runPythonAsync(code);
      const stdout = pyodideRef.current.runPython("sys.stdout.getvalue()");
      return stdout || result?.toString() || "Code executed without output.";
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  };

  useEffect(() => localStorage.setItem('agentic-chat-persona', persona), [persona]);
  useEffect(() => {
    try {
      localStorage.setItem('agentic-chat-messages', JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save messages to localStorage", e);
    }
  }, [messages]);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY as string }), []);

  const handlePersonaChange = (newPersona: Persona) => {
    if (newPersona === persona) return;
    if (messages.length > 0) {
      if (window.confirm("Changing the persona will start a new conversation. Are you sure?")) {
        setMessages([]);
        chatRef.current = null; // Reset chat history
        setPersona(newPersona);
      }
    } else {
      setPersona(newPersona);
    }
  };

  const processStream = async (stream: AsyncGenerator<GenerateContentResponse>, assistantMessageId: string) => {
    let fullText = '';
    let sources: GroundingSource[] = [];
    let parsedPlan: Plan | undefined;
    let functionCalls: FunctionCall[] | undefined;
  
    for await (const chunk of stream) {
      if (chunk.text) {
          fullText += chunk.text;
      }

      if (chunk.functionCalls) {
        functionCalls = chunk.functionCalls.map(fc => ({ name: fc.name, args: fc.args }));
      }
      
      if (fullText.includes('{') && fullText.includes('}')) {
        try {
            const potentialJson = fullText.substring(fullText.indexOf('{'), fullText.lastIndexOf('}') + 1);
            const parsed = JSON.parse(potentialJson);
            if(parsed.plan) parsedPlan = parsed;
        } catch (e) { /* continue accumulating */ }
      }

      const metadata = chunk.candidates?.[0]?.groundingMetadata as GroundingMetadata | undefined;
      if (metadata?.groundingChunks) {
        sources = metadata.groundingChunks
          .map(c => c.web).filter((web): web is { uri: string, title: string } => !!web?.uri)
          .map(web => ({ uri: web.uri, title: web.title || '' }));
      }
      setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId ? { ...msg, content: fullText, sources, plan: parsedPlan, functionCalls } : msg
      ));
    }
    return { fullText, sources, parsedPlan, functionCalls };
  };


  const handleSendMessage = useCallback(async (prompt: string, file?: FileData, repoUrl?: string) => {
    if (isLoading || !isPyodideReady) return;
    setIsLoading(true);
    setError(null);

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: prompt,
      ...(file && { file: { name: file.name, type: file.type } }),
      ...(repoUrl && { repo: { url: repoUrl, owner: '', repo: '' } }),
    };

    setMessages(prev => [...prev, userMessage]);
    
    try {
      // 1. Router Agent Call
      const routerResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: `Classify the user's intent for the following query: "${prompt}"` }] },
        config: { tools: [{ functionDeclarations: [ROUTER_TOOL] }] }
      });
      
      let routedTask: TaskType = TaskType.Chat;
      if (routerResponse.functionCalls?.[0]) {
          const { route } = routerResponse.functionCalls[0].args;
          if (Object.values(TaskType).includes(route as TaskType)) routedTask = route as TaskType;
      }
      if (file?.type.startsWith('image/')) routedTask = TaskType.Vision;
      
      const assistantMessageId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: assistantMessageId, role: 'assistant', content: '', isLoading: true, taskType: routedTask }]);

      // 2. Prepare for Specialist Agent
      let analysisPrompt = prompt;
      let repoDataForUserMessage: RepoData | undefined;
      // ... (GitHub analysis logic remains the same)

      const parts: Part[] = [{ text: analysisPrompt }];
      if (file) parts.push(fileToGenerativePart(file));
      
      const taskConfig = TASK_CONFIGS[routedTask];
      if (!chatRef.current) {
        let systemInstruction = [PERSONA_CONFIGS[persona].instruction];
        const configWithMaybeInstruction = taskConfig.config as any;
        if(configWithMaybeInstruction.systemInstruction) {
            systemInstruction.push(configWithMaybeInstruction.systemInstruction.parts[0].text);
        }
        
        const history: Content[] = messages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }] // Simplified history
        }));

        chatRef.current = ai.chats.create({
          model: taskConfig.model,
          config: {
            ...taskConfig.config,
            ...(systemInstruction.filter(Boolean).length > 0 && { systemInstruction: { parts: [{ text: systemInstruction.join('\n\n') }] } }),
          },
          history
        });
      }

      // 3. First Turn (User -> Model)
      // FIX: The `sendMessageStream` method expects a `message` property, not `parts`.
      const stream1 = await chatRef.current.sendMessageStream({ message: parts });
      const { functionCalls } = await processStream(stream1, assistantMessageId);

      setMessages(prev => prev.map(msg => msg.id === assistantMessageId ? { ...msg, isLoading: false } : msg));

      // 4. Handle Tool Call if present
      if (functionCalls && functionCalls.length > 0 && functionCalls[0].name === 'code_interpreter') {
          const code = functionCalls[0].args.code;
          const output = await runPythonCode(code);
          
          const observationMessageId = (Date.now() + 2).toString();
          setMessages(prev => [...prev, { id: observationMessageId, role: 'assistant', content: `Observation:\n${output}` }]);
          
          const finalAnswerId = (Date.now() + 3).toString();
          setMessages(prev => [...prev, { id: finalAnswerId, role: 'assistant', content: '', isLoading: true, taskType: routedTask }]);

          const toolParts: Part[] = [{
              functionResponse: { name: 'code_interpreter', response: { content: output } }
          }];
          
          // FIX: The `sendMessageStream` method expects a `message` property, not `parts`.
          const stream2 = await chatRef.current.sendMessageStream({ message: toolParts });
          await processStream(stream2, finalAnswerId);
          setMessages(prev => prev.map(msg => msg.id === finalAnswerId ? { ...msg, isLoading: false } : msg));
      }

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(errorMsg);
      setMessages(prev => prev.map(msg => msg.isLoading ? { ...msg, content: `Error: ${errorMsg}`, isLoading: false } : msg));
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, ai, persona, messages, isPyodideReady]);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-gray-100 font-sans">
      <Header persona={persona} onPersonaChange={handlePersonaChange} />
      <main className="flex-1 overflow-y-auto pt-32 pb-4">
        <div className="max-w-4xl mx-auto px-4">
          {messages.length === 0 && !isLoading ? (
            <div className="text-center text-gray-400 mt-8">
              <h2 className="text-2xl font-semibold mb-2">Agentic AI Chat</h2>
              <p className="text-sm">Your intelligent assistant swarm. How can I help you today?</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => <Message key={msg.id} message={msg} />)}
              <div ref={messagesEndRef} />
            </>
          )}
          {error && <div className="text-red-400 text-center p-4 bg-red-900/50 rounded-lg">{error}</div>}
        </div>
      </main>
      <footer className="sticky bottom-0 left-0 right-0">
          <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isPyodideReady={isPyodideReady}/>
          <div className="text-xs text-center text-gray-500 py-1 bg-gray-800">
            Python Environment: {isPyodideReady ? 'Ready' : 'Loading...'}
          </div>
      </footer>
    </div>
  );
};

export default App;
