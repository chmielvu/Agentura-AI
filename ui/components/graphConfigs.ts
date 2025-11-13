
import { TaskType } from '../../types';

export const svgToDataURI = (svgString: string, color: string = '#E0E0E0'): string => {
    const coloredSvg = svgString.replace(/currentColor/g, color);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(coloredSvg)}`;
};

export const iconSvgs = {
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
    OptimizeIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h18M7.5 4.5v5.25l-4.5 4.5v3h15v-3l-4.5-4.5V4.5" /></svg>`,
    ChatBubbleLeftRightIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193l-3.72.111c-.443.03.792.87.53 1.295l-2.086.99c-.366.174-.844-.058-1.146-.417l-1.538-1.39c-.375-.34-.942-.34-1.317 0l-1.538 1.39c-.302.36-.78.592-1.146.417l-2.086-.99c-.262-.425.973-1.265.53-1.295L3.48 17.09c-1.133-.093-1.98-1.057-1.98-2.193v-4.286c0-.97.616-1.813 1.5-2.097m16.5 0a2.25 2.25 0 00-2.25-2.25h-12a2.25 2.25 0 00-2.25 2.25m16.5 0v-5.511c0-.274-.224-.499-.5-.499H3.75c-.276 0-.5.225-.5.5v5.511m16.5 0z" /></svg>`,
    ImageIcon: `<svg fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>`,
};

export type GraphNode = { id: number; label: string; icon: keyof typeof iconSvgs };
type GraphEdge = { from: number; to: number; id: string };

export const agentGraphConfigs: Record<string, { nodes: GraphNode[], edges: GraphEdge[] }> = {
    [TaskType.Chat]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' }, 
            { id: 2, label: 'Chat', icon: 'ChatBubbleLeftRightIcon' }
        ],
        edges: [{ from: 1, to: 2, id: '1_2' }],
    },
    [TaskType.Code]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' },
            { id: 2, label: 'Code Gen', icon: 'CodeBracketIcon' },
            { id: 3, label: 'Execute', icon: 'PerceptionIcon' },
            { id: 4, label: 'Critique', icon: 'CritiqueIcon' },
            { id: 5, label: 'Synthesize', icon: 'BrainCircuitIcon' },
        ],
        edges: [
            { from: 1, to: 2, id: '1_2' }, 
            { from: 2, to: 3, id: '2_3' }, 
            { from: 3, to: 4, id: '3_4' }, 
            { from: 4, to: 5, id: '4_5' }
        ],
    },
    [TaskType.Research]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' }, 
            { id: 2, label: 'Search/Refine', icon: 'SearchIcon' }, 
            { id: 3, label: 'Verify Sources', icon: 'CritiqueIcon' }, 
            { id: 4, label: 'Synthesize', icon: 'BrainCircuitIcon' }
        ],
        edges: [
            { from: 1, to: 2, id: '1_2' },
            { from: 2, to: 3, id: '2_3' }, 
            { from: 3, to: 4, id: '3_4' }
        ],
    },
    [TaskType.Complex]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' }, 
            { id: 2, label: 'Generate v1', icon: 'GenerateIcon' }, 
            { id: 3, label: 'Critique', icon: 'CritiqueIcon' }, 
            { id: 4, label: 'Synthesize v2', icon: 'BrainCircuitIcon' }
        ],
        edges: [
            { from: 1, to: 2, id: '1_2' }, 
            { from: 2, to: 3, id: '2_3' }, 
            { from: 3, to: 4, id: '3_4' }
        ],
    },
    [TaskType.Planner]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' }, 
            { id: 2, label: 'Plan', icon: 'PlanIcon' }
        ],
        edges: [{ from: 1, to: 2, id: '1_2' }],
    },
    [TaskType.Vision]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' }, 
            { id: 2, label: 'Analyze', icon: 'ImageIcon' }
        ],
        edges: [{ from: 1, to: 2, id: '1_2' }],
    },
    [TaskType.Creative]: {
        nodes: [
            { id: 1, label: 'Router', icon: 'RouterIcon' },
            { id: 2, label: 'Create', icon: 'SparklesIcon' }, 
            { id: 3, label: 'Tool Call', icon: 'GenerateIcon' }
        ],
        edges: [
            { from: 1, to: 2, id: '1_2' }, 
            { from: 2, to: 3, id: '2_3' }
        ],
    },
    [TaskType.Critique]: {
        nodes: [{ id: 1, label: 'Analyze', icon: 'CritiqueIcon' }],
        edges: [],
    },
    [TaskType.Retry]: {
        nodes: [
            { id: 1, label: 'Critique', icon: 'CritiqueIcon' }, 
            { id: 2, label: 'APO Refine', icon: 'OptimizeIcon' }, 
            { id: 3, label: 'Re-run', icon: 'BrainCircuitIcon' }
        ],
        edges: [
            { from: 1, to: 2, id: '1_2' }, 
            { from: 2, to: 3, id: '2_3' }
        ],
    }
};
