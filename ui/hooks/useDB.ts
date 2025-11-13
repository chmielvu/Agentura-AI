
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
        console.error("Failed to initialize the database. This may be due to browser restrictions (e.g., private browsing mode).", e);
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

export const useDB = () => {
    const db = getDbInstance();

    const addDocument = async (chunk: DocChunk) => {
        return await db.chunks.put(chunk);
    };

    const findSimilar = async (queryVector: number[], topK = 5) => {
        if (!queryVector || queryVector.length === 0) return [];
        
        // --- SOTA IMPROVEMENT (OPPORTUNITY 3): PERFORMANCE WARNING ---
        // This is a brute-force O(n) scan. It will not scale beyond a few thousand chunks.
        // A production-grade solution would use an optimized index (e.g., HNSWlib) or a server-side vector DB.
        const allChunks = await db.chunks.toArray();
        if (allChunks.length > 1000) {
            console.warn(`[PERFORMANCE WARNING] Client-side vector search is scanning ${allChunks.length} chunks. This will be slow. Consider implementing a server-side vector DB or a client-side HNSW index.`);
        }
        // --- END SOTA IMPROVEMENT ---
        
        const scored = allChunks.map(chunk => ({
            ...chunk,
            similarity: cosineSimilarity(queryVector, chunk.embedding)
        }));
        return scored.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    };

    const getArchiveSummary = async (): Promise<ArchiveSummary[]> => {
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
        const chunksToDelete = await db.chunks.where('source').equals(sourceName).primaryKeys();
        return await db.chunks.bulkDelete(chunksToDelete);
    };

    const clearArchive = async () => {
        await db.chunks.clear();
        await db.reflexionMemory.clear(); // Also clear reflexion memory
    };

    // --- NEW FUNCTIONS FOR MANDATES 3.1 & 3.2 ---
    const addReflexionEntry = async (entry: ReflexionEntry) => {
        return await db.reflexionMemory.put(entry);
    };

    const findSimilarReflexions = async (queryEmbedding: number[], topK = 2): Promise<ReflexionEntry[]> => {
        if (!queryEmbedding || queryEmbedding.length === 0) return [];
        
        // Ensure table exists by calling getDbInstance()
        getDbInstance();
        
        // SOTA: This is also a brute-force scan and will not scale.
        const allReflexions = await db.reflexionMemory.toArray();
        if (allReflexions.length === 0) return [];
        
        const scored = allReflexions.map(entry => ({
            ...entry,
            similarity: cosineSimilarity(queryEmbedding, entry.promptEmbedding)
        }));
        
        // Filter for only relevant lessons (e.g., similarity > 0.7)
        return scored
            .sort((a, b) => b.similarity - a.similarity)
            .filter(r => r.similarity > 0.7)
            .slice(0, topK);
    };
    
    const getChunksBySourcePrefix = async (prefix: string) => {
        return await db.chunks.where('source').startsWith(prefix).toArray();
    };
    // --- END NEW FUNCTIONS ---


    return { 
        addDocument, 
        findSimilar, 
        clearArchive, 
        getArchiveSummary, 
        deleteSource, 
        getChunksBySourcePrefix,
        addReflexionEntry,      // MANDATE 3.1
        findSimilarReflexions,  // MANDATE 3.2
    };
};
