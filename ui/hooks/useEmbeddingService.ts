
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDB, DocChunk } from './useDB';

export const useEmbeddingService = () => {
    const workerRef = useRef<Worker | null>(null);
    const [isReady, setIsReady] = useState(false);
    const { addDocument } = useDB();

    // A queue to manage requests to the single-threaded worker
    const requestQueue = useRef<Map<string, { resolve: (embedding: number[]) => void, reject: (error: any) => void }>>(new Map());

    useEffect(() => {
        try {
            // FIX: Use relative path './' to ensure worker loads from the correct sandboxed origin
            workerRef.current = new Worker('./embedding-worker.js', { type: 'module' });

            workerRef.current.onmessage = (event) => {
                const { status, embedding, error, textKey } = event.data;
                if (status === 'ready') setIsReady(true);

                const resolver = requestQueue.current.get(textKey);
                if (!resolver) return;

                if (status === 'complete') {
                    resolver.resolve(embedding);
                } else if (status === 'error') {
                    resolver.reject(new Error(error));
                }
                requestQueue.current.delete(textKey);
            };
            
            workerRef.current.onerror = (event) => {
                console.error("Embedding worker error:", event);
                setIsReady(false);
                // Reject any pending promises in the queue
                requestQueue.current.forEach((resolver) => {
                    resolver.reject(new Error("Embedding worker failed to load or encountered an error."));
                });
                requestQueue.current.clear();
            };

        } catch (e) {
            console.error("Failed to initialize embedding worker:", e);
            setIsReady(false);
        }

        return () => workerRef.current?.terminate();
    }, []);

    const generateEmbedding = useCallback((text: string): Promise<number[]> => {
        // Use a simple key for the queue
        const textKey = `${Date.now()}-${Math.random()}`;
        return new Promise((resolve, reject) => {
            if (!workerRef.current) {
                reject(new Error("Embedding worker is not initialized."));
                return;
            }
            requestQueue.current.set(textKey, { resolve, reject });
            workerRef.current?.postMessage({ type: 'generate-embedding', text, textKey });
        });
    }, []);

    const processAndEmbedDocument = async (docName: string, text: string) => {
        // A simple chunking strategy
        const chunks = text.split('\n\n').filter(t => t.trim().length > 20);

        for (const [index, chunk] of chunks.entries()) {
            const embedding = await generateEmbedding(chunk);
            const docChunk: DocChunk = {
                id: `${docName}-${index}`,
                source: docName,
                text: chunk,
                embedding: embedding
            };
            await addDocument(docChunk);
        }
    };

    return { isReady, processAndEmbedDocument, generateEmbedding };
};
