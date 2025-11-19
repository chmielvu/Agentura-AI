import React, { useState, useEffect } from 'react';
import { db } from '../hooks/useDB'; // Use our hook
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
            return <code key={i} className="text-xs font-mono bg-muted p-1 rounded-sm text-primary">{part.substring(1, part.length - 1)}</code>;
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
                <pre key={pIndex} className="text-xs bg-background p-3 rounded-md border border-border text-muted-foreground font-mono my-4">
                    <code>{paragraph.replace(/```/g, '').trim()}</code>
                </pre>
            );
        }
        
        // Handle headers
        if (paragraph.startsWith('#')) {
            return (
                <h3 key={pIndex} className="text-2xl font-bold mt-6 mb-2 text-primary">
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
                <ListTag key={pIndex} className={`${listClass} list-inside mb-4 space-y-1 pl-4`}>
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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGuide = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const docs = await db.getChunksBySourcePrefix('canvas_assets/guide/');
                const grouped = new Map<string, string[]>();
                docs.forEach(chunk => {
                    const content = grouped.get(chunk.source) || [];
                    content.push(chunk.text);
                    grouped.set(chunk.source, content);
                });
                const formatted: GuideDoc[] = Array.from(grouped.entries()).map(([source, content]) => ({
                    source: source,
                    content: content.join('\n\n')
                }));
                formatted.sort((a, b) => a.source.localeCompare(b.source));
                setGuideDocs(formatted);
            } catch (e) {
                console.error("Failed to fetch guide from archive:", e);
                setError("Could not load guide from the document archive. This can happen if IndexedDB is disabled in your browser (e.g., in private browsing mode).");
            } finally {
                setIsLoading(false);
            }
        };
        fetchGuide();
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex flex-col" onClick={onClose}>
            <div className="w-full h-full" onClick={(e) => e.stopPropagation()}>
                <div className="bg-card h-full flex flex-col">
                    <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-border">
                        <h2 className="text-lg font-sans font-semibold text-foreground">Agentic Guide</h2>
                        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                            <XCircleIcon className="w-7 h-7" />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 font-sans">
                        <div className="max-w-3xl mx-auto space-y-6 text-foreground/90 leading-relaxed">
                            {isLoading ? (
                                <p>Loading Guide from Archive...</p>
                            ) : error ? (
                                <div className="p-4 bg-destructive/20 border border-destructive text-destructive-foreground rounded-lg text-sm">
                                    <h3 className="font-bold mb-2">Error Loading Guide</h3>
                                    <p>{error}</p>
                                </div>
                            ) : (
                                guideDocs.map(doc => (
                                    <div key={doc.source}>
                                        {renderMarkdown(doc.content)}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};