
import React, { useState, useEffect } from 'react';
import { useDB } from '../hooks/useDB'; // Use our hook
import { XCircleIcon } from '../../components/Icons';

interface GuideDoc {
    source: string;
    content: string;
}

// Helper for inline styles like bold and code
const renderInlineMarkdown = (text: string) => {
    return text.split(/(\*\*.*?\*\*|`.*?`)/g).map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i}>{part.substring(2, part.length - 2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
            return <code key={i} className="text-xs font-mono bg-background p-0.5 rounded-sm">{part.substring(1, part.length - 1)}</code>;
        }
        return part;
    });
};

// Main renderer for block-level elements
const renderMarkdown = (text: string) => {
    return text.split('\n\n').map((paragraph, pIndex) => {
        // Handle code blocks
        if (paragraph.startsWith('```')) {
            return (
                <pre key={pIndex} className="text-xs bg-background p-2 rounded-sm border border-border/50 text-foreground/70 font-mono my-4">
                    <code>{paragraph.replace(/```/g, '').trim()}</code>
                </pre>
            );
        }
        
        // Handle headers
        if (paragraph.startsWith('#')) {
            return (
                <h3 key={pIndex} className="text-2xl font-bold mt-6 mb-2 text-accent">
                    {paragraph.replace(/#/g, '').trim()}
                </h3>
            );
        }

        // Handle lists
        const isUnordered = paragraph.trim().startsWith('* ');
        const isOrdered = paragraph.trim().match(/^\d+\.\s/);
        
        if (isUnordered || isOrdered) {
            const items = paragraph.split('\n').map(item => 
                isUnordered 
                ? item.trim().substring(2)
                : item.trim().replace(/^\d+\.\s/, '')
            );
            const ListTag = isUnordered ? 'ul' : 'ol';
            const listClass = isUnordered ? 'list-disc' : 'list-decimal';

            return (
                <ListTag key={pIndex} className={`${listClass} list-inside mb-4 space-y-1`}>
                    {items.map((li, liIndex) => <li key={liIndex}>{renderInlineMarkdown(li)}</li>)}
                </ListTag>
            );
        }
        
        // Handle regular paragraphs
        return (
            <p key={pIndex} className="mb-4">
                {renderInlineMarkdown(paragraph)}
            </p>
        );
    });
};

export const GuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [guideDocs, setGuideDocs] = useState<GuideDoc[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { getChunksBySourcePrefix } = useDB(); // Use the refined function from our hook

    useEffect(() => {
        const fetchGuide = async () => {
            // Use the encapsulated hook function
            const docs = await getChunksBySourcePrefix('canvas_assets/guide/');

            // Group chunks by source
            const grouped = new Map<string, string[]>();
            docs.forEach(chunk => {
                const content = grouped.get(chunk.source) || [];
                content.push(chunk.text);
                grouped.set(chunk.source, content);
            });

            const formatted: GuideDoc[] = Array.from(grouped.entries()).map(([source, content]) => ({
                source: source, // Keep full path for sorting
                content: content.join('\n\n')
            }));
            
            // Sort by filename (01, 02, 03...)
            formatted.sort((a, b) => a.source.localeCompare(b.source));

            setGuideDocs(formatted);
            setIsLoading(false);
        };
        fetchGuide();
    }, [getChunksBySourcePrefix]);

    return (
        <div className="fixed inset-0 bg-background z-50 flex flex-col">
            {/* 1. Header (matches app font) */}
            <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-border">
                <h2 className="text-lg font-sans font-semibold text-foreground">Agentic Guide</h2>
                <button onClick={onClose} className="text-foreground/70 hover:text-white transition-colors">
                    <XCircleIcon className="w-7 h-7" />
                </button>
            </div>

            {/* 2. Content (uses readable font) */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 font-sans"> {/* Use font-sans */}
                <div className="max-w-3xl mx-auto space-y-6 text-foreground/90 leading-relaxed">
                    {isLoading ? (
                        <p>Loading Guide from Archive...</p>
                    ) : (
                        guideDocs.map(doc => (
                            <div key={doc.source}>
                                {/* Render the pseudo-markdown */}
                                {renderMarkdown(doc.content)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
