
import React, { useState, useEffect } from 'react';
import { useDB, ArchiveSummary } from '../hooks/useDB';

export const ArchiveManager: React.FC = () => {
    const [summary, setSummary] = useState<ArchiveSummary[]>([]);
    const { getArchiveSummary, deleteSource, clearArchive } = useDB();
    const [error, setError] = useState<string | null>(null);

    const refreshSummary = async () => {
        setError(null);
        try {
            const s = await getArchiveSummary();
            setSummary(s);
        } catch (e) {
            console.error("Failed to refresh archive summary:", e);
            setError("Could not access the document archive. This can happen if IndexedDB is disabled in your browser (e.g., in private browsing mode).");
            setSummary([]);
        }
    };

    useEffect(() => {
        refreshSummary();
    }, []);

    const handleDelete = async (sourceName: string) => {
        if (window.confirm(`Are you sure you want to delete all chunks from ${sourceName}?`)) {
            try {
                await deleteSource(sourceName);
                refreshSummary();
            } catch (e) {
                console.error(`Failed to delete source ${sourceName}:`, e);
                setError("Failed to delete the document.");
            }
        }
    };

    const handleClearAll = async () => {
        if (window.confirm('Are you sure you want to delete ALL documents from your personal archive? This cannot be undone.')) {
            try {
                await clearArchive();
                refreshSummary();
            } catch (e) {
                console.error("Failed to clear archive:", e);
                setError("Failed to clear the archive.");
            }
        }
    };

    return (
        <div className="p-2">
            <p className="text-xs text-foreground/60 mb-3 px-1">
                Manage the documents in your persistent RAG archive.
            </p>
            {error && (
                <div className="p-2 mb-3 bg-accent/20 border border-accent text-accent text-xs rounded-sm">
                    {error}
                </div>
            )}
            <button
                onClick={handleClearAll}
                className="w-full mb-3 text-xs bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded-sm transition-colors disabled:opacity-50"
                disabled={!!error || summary.length === 0}
            >
                Delete All Documents
            </button>
            <ul className="space-y-2">
                {summary.length === 0 && !error && (
                    <li className="text-center text-xs text-foreground/50 py-4">No documents in archive.</li>
                )}
                {summary.map(item => (
                    <li key={item.source} className="flex items-center justify-between p-2 bg-card rounded-sm">
                        <div>
                            <p className="font-mono text-sm font-bold text-foreground truncate max-w-xs" title={item.source}>{item.source}</p>
                            <p className="text-xs text-foreground/60">{item.chunkCount} chunk(s)</p>
                        </div>
                        <button
                            onClick={() => handleDelete(item.source)}
                            className="text-xs text-red-500 hover:text-red-400"
                        >
                            Delete
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
