
import Dexie, { Table } from 'dexie';

export interface DocChunk {
    id: string; // Primary key (e.g., "my-file.txt-0")
    text: string;
    embedding: number[];
    source: string; // Indexed source name (e.g., "my-file.txt")
}

export interface ArchiveSummary {
    source: string;
    chunkCount: number;
}

// --- LAZY INITIALIZATION TO PREVENT CRASH ON LOAD ---
let dbInstance: (Dexie & { chunks: Table<DocChunk, string> }) | null = null;

const getDbInstance = () => {
    if (dbInstance) {
        return dbInstance;
    }
    // This try-catch is crucial. If IndexedDB is disabled (e.g., private browsing),
    // instantiating Dexie will throw an error. By catching it here, we prevent a
    // top-level uncaught exception that would crash the entire application on load.
    try {
        const db = new Dexie('AgenturaVectorDB') as Dexie & {
            chunks: Table<DocChunk, string>;
        };

        db.version(1).stores({
            chunks: 'id, source',
        });
        dbInstance = db;
        return dbInstance;
    } catch (e) {
        console.error("Failed to initialize the database. This may be due to browser restrictions (e.g., private browsing mode).", e);
        // Let the calling function handle the error.
        throw e;
    }
};


// --- Helper function for client-side vector search ---
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}
// ---------------------------------------------------

export const useDB = () => {
    const addDocument = async (chunk: DocChunk) => {
        const db = getDbInstance();
        return await db.chunks.put(chunk);
    };

    const findSimilar = async (queryVector: number[], topK = 5) => {
        if (!queryVector || queryVector.length === 0) return [];
        const db = getDbInstance();
        const allChunks = await db.chunks.toArray();
        const scored = allChunks.map(chunk => ({
            ...chunk,
            similarity: cosineSimilarity(queryVector, chunk.embedding)
        }));
        return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    };

    const getArchiveSummary = async (): Promise<ArchiveSummary[]> => {
        const db = getDbInstance();
        const summary = new Map<string, number>();
        await db.chunks.each(chunk => {
            summary.set(chunk.source, (summary.get(chunk.source) || 0) + 1);
        });
        return Array.from(summary.entries()).map(([source, chunkCount]) => ({
            source,
            chunkCount
        }));
    };

    const deleteSource = async (sourceName: string) => {
        const db = getDbInstance();
        const chunksToDelete = await db.chunks.where('source').equals(sourceName).primaryKeys();
        return await db.chunks.bulkDelete(chunksToDelete);
    };

    const clearArchive = async () => {
        const db = getDbInstance();
        return await db.chunks.clear();
    };

    // --- NEW FUNCTION FOR GUIDE MODAL ---
    const getChunksBySourcePrefix = async (prefix: string) => {
        const db = getDbInstance();
        return await db.chunks.where('source').startsWith(prefix).toArray();
    };
    // --- END NEW FUNCTION ---

    return { addDocument, findSimilar, clearArchive, getArchiveSummary, deleteSource, getChunksBySourcePrefix };
};
