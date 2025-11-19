
import { db, DocChunk } from './useDB';

let worker: Worker | null = null;
let initializationPromise: Promise<void> | null = null;
const requestQueue = new Map<string, { resolve: (embedding: number[]) => void, reject: (error: any) => void }>();

const initializeEmbeddingWorker = (): Promise<void> => {
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = new Promise((resolve, reject) => {
        if (worker) {
            resolve();
            return;
        }

        try {
            worker = new Worker('./embedding-worker.js', { type: 'module' });

            worker.onmessage = (event) => {
                const { status, embedding, error, textKey } = event.data;

                if (status === 'ready') {
                    resolve(); // Worker is ready
                }

                const resolver = requestQueue.get(textKey);
                if (!resolver) return;

                if (status === 'complete') {
                    resolver.resolve(embedding);
                } else if (status === 'error') {
                    resolver.reject(new Error(error));
                }
                requestQueue.delete(textKey);
            };

            worker.onerror = (event) => {
                console.error("Embedding worker error:", event);
                worker = null;
                initializationPromise = null; // Allow retrying
                const err = new Error("Embedding worker failed to load or encountered an error.");
                requestQueue.forEach((resolver) => resolver.reject(err));
                requestQueue.clear();
                reject(err);
            };
        } catch (e) {
            console.error("Failed to initialize embedding worker:", e);
            worker = null;
            initializationPromise = null;
            reject(e);
        }
    });

    return initializationPromise;
};

const generateEmbedding = async (text: string): Promise<number[]> => {
    if (!initializationPromise) {
        throw new Error("Embedding worker not initialized. Call initializeEmbeddingWorker first.");
    }
    await initializationPromise; // Ensure worker is ready

    const textKey = `${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
        if (!worker) {
            reject(new Error("Embedding worker is not available."));
            return;
        }
        requestQueue.set(textKey, { resolve, reject });
        worker.postMessage({ type: 'generate-embedding', text, textKey });
    });
};

const processAndEmbedDocument = async (
  docName: string,
  text: string,
  onProgress?: (update: { current: number, total: number }) => void
) => {
    if (!initializationPromise) {
        throw new Error("Embedding worker not initialized.");
    }
    await initializationPromise;

    const chunks = text.split('\n\n').filter(t => t.trim().length > 20);
    const totalChunks = chunks.length;

    for (const [index, chunk] of chunks.entries()) {
        const embedding = await generateEmbedding(chunk);
        const docChunk: DocChunk = {
            id: `${docName}-${index}`,
            source: docName,
            text: chunk,
            embedding: embedding
        };
        await db.addDocument(docChunk);
        onProgress?.({ current: index + 1, total: totalChunks });
    }
};

export const embeddingService = {
    initialize: initializeEmbeddingWorker,
    processAndEmbedDocument,
    generateEmbedding,
};
