
import Dexie, { Table } from 'dexie';
import { DocChunk, ArchiveSummary } from './dbTypes'; // Create dbTypes.ts
import { ReflexionEntry } from '../../types';

export * from './dbTypes';

// --- LAZY INITIALIZATION TO PREVENT CRASH ON LOAD ---
let dbInstance: (Dexie & { 
    chunks: Table<DocChunk, string>;
    reflexionMemory: Table<ReflexionEntry, number>; // MANDATE 3.1
}) | null = null;

const getDbInstance = () => {
    if (dbInstance) {
        return dbInstance as Dexie & { chunks: Table<DocChunk, string>, reflexionMemory: Table<ReflexionEntry, number> };
    }
    if (typeof window === 'undefined') {
         // Handle SSR or non-browser environments gracefully
         return null as any;
    }
    try {
        const db = new Dexie('AgenturaVectorDB') as Dexie & {
            chunks: Table<DocChunk, string>;
            reflexionMemory: Table<ReflexionEntry, number>; // MANDATE 3.1
        };

        // Schema v1
        db.version(1).stores({
            chunks: 'id, source',
        });
        
        // Schema v2 (MANDATE 3.1)
        db.version(2).stores({
            chunks: 'id, source',
            reflexionMemory: '++id', // We will search this via linear scan + cosine similarity
        }).upgrade(tx => {
            console.log("Upgrading AgenturaVectorDB to v2, adding reflexionMemory table.");
            // Migration logic, if any, would go here.
            return tx.table("reflexionMemory").clear(); // Ensure it's clean on upgrade
        });
        
        dbInstance = db;
        return dbInstance;
    } catch (e) {
        console.warn("Failed to initialize the database. This may be due to browser restrictions (e.g., private browsing mode). Features requiring persistent storage will be disabled.", e);
        return null as any;
    }
};


// --- Helper function for client-side vector search ---
function cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += (vecA[i] || 0) * (vecB[i] || 0);
        magA += (vecA[i] || 0) * (vecA[i] || 0);
        magB += (vecB[i] || 0) * (vecB[i] || 0);
    }
    magA = Math.sqrt(magA);
    magB = Math.sqrt(magB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct / (magA * magB);
}
// ---------------------------------------------------

const addDocument = async (chunk: DocChunk) => {
    const db = getDbInstance();
    if (!db) return;
    try {
        return await db.chunks.put(chunk);
    } catch(e) { console.warn("DB write failed", e); }
};

const findSimilar = async (queryVector: number[], topK = 5, sourceFilter?: string) => {
    const db = getDbInstance();
    if (!db) return [];
    if (!queryVector || queryVector.length === 0) return [];
    
    try {
        const allChunks = await (sourceFilter
            ? db.chunks.where('source').equals(sourceFilter).toArray()
            : db.chunks.toArray());

        if (allChunks.length > 1000 && !sourceFilter) {
            console.warn(`[PERFORMANCE WARNING] Client-side vector search is scanning ${allChunks.length} chunks. This will be slow.`);
        }
        
        const scored = allChunks.map(chunk => ({
            ...chunk,
            similarity: cosineSimilarity(queryVector, chunk.embedding)
        }));
        return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    } catch (e) {
        console.warn("DB search failed", e);
        return [];
    }
};

const getArchiveSummary = async (): Promise<ArchiveSummary[]> => {
    const db = getDbInstance();
    if (!db) return [];
    try {
        const summary = new Map<string, number>();
        await db.chunks.each(chunk => {
            summary.set(chunk.source, (summary.get(chunk.source) || 0) + 1);
        });
        return Array.from(summary.entries()).map(([source, chunkCount]) => ({
            source,
            chunkCount
        }));
    } catch(e) {
        console.warn("DB summary failed", e);
        return [];
    }
};

const deleteSource = async (sourceName: string) => {
    const db = getDbInstance();
    if (!db) return;
    try {
        const chunksToDelete = await db.chunks.where('source').equals(sourceName).primaryKeys();
        return await db.chunks.bulkDelete(chunksToDelete);
    } catch(e) { console.warn("DB delete failed", e); }
};

const clearArchive = async () => {
    const db = getDbInstance();
    if (!db) return;
    try {
        await db.chunks.clear();
        await db.reflexionMemory.clear();
    } catch(e) { console.warn("DB clear failed", e); }
};

const addReflexionEntry = async (entry: ReflexionEntry) => {
    const db = getDbInstance();
    if (!db) return;
    try {
        return await db.reflexionMemory.put(entry);
    } catch(e) { console.warn("DB write failed", e); }
};

const findSimilarReflexions = async (queryEmbedding: number[], topK = 2): Promise<ReflexionEntry[]> => {
    const db = getDbInstance();
    if (!db) return [];
    if (!queryEmbedding || queryEmbedding.length === 0) return [];
    
    try {
        const allReflexions = await db.reflexionMemory.toArray();
        if (allReflexions.length === 0) return [];
        
        const scored = allReflexions.map(entry => ({
            ...entry,
            similarity: cosineSimilarity(queryEmbedding, entry.promptEmbedding)
        }));
        
        return scored
            .sort((a, b) => b.similarity - a.similarity)
            .filter(r => r.similarity > 0.7)
            .slice(0, topK);
    } catch(e) {
        console.warn("DB search failed", e);
        return [];
    }
};

const getChunksBySourcePrefix = async (prefix: string) => {
    const db = getDbInstance();
    if (!db) return [];
    try {
        return await db.chunks.where('source').startsWith(prefix).toArray();
    } catch(e) {
        console.warn("DB prefix search failed", e);
        return [];
    }
};

export const db = {
    addDocument, 
    findSimilar, 
    clearArchive, 
    getArchiveSummary, 
    deleteSource, 
    getChunksBySourcePrefix,
    addReflexionEntry,
    findSimilarReflexions,
};
