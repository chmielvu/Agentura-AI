
// This file isolates Dexie-specific types to prevent import errors in non-Dexie modules.

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
