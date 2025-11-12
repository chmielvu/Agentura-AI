

import React, { useState, useMemo, useRef } from 'react';
import { FileData, TaskType } from '../../types';
import { readFileAsBase64 } from '../hooks/helpers';
import { SendIcon, PaperclipIcon, XCircleIcon, GitHubIcon } from '../../components/Icons';

const gitHubRepoRegex = /https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/;

export const ChatInput: React.FC<{
  onSendMessage: (prompt: string, file?: FileData, repoUrl?: string, forcedTask?: TaskType) => void;
  isLoading: boolean;
  isPyodideReady: boolean;
  isEmbedderReady: boolean;
  onEmbedFile: (docName: string, text: string) => Promise<void>;
}> = ({ onSendMessage, isLoading, isPyodideReady, isEmbedderReady, onEmbedFile }) => {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  const commandPaletteRoutes = [
      { command: '/code', task: TaskType.Code, desc: 'Generate or execute code' },
      { command: '/research', task: TaskType.Research, desc: 'Search the web for info' },
      { command: '/plan', task: TaskType.Planner, desc: 'Create a multi-step plan' },
      { command: '/creative', task: TaskType.Creative, desc: 'Generate creative content' },
      { command: '/add_agent', task: TaskType.Meta, desc: 'Create a new agent' },
  ];

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = e.target.value;
      const match = newPrompt.match(gitHubRepoRegex);
      if (match && !repoUrl) {
          setRepoUrl(match[0]);
          setPrompt(newPrompt.replace(match[0], '').trim());
      } else {
          setPrompt(newPrompt);
      }
      setShowCommandPalette(newPrompt.startsWith('/'));
  };

  const handleCommandSelect = (task: TaskType, command: string) => {
      onSendMessage(prompt.replace(command, '').trim(), undefined, undefined, task);
      setPrompt('');
      setShowCommandPalette(false);
  }

  const handleSubmit = async () => {
    if (isLoading || !isPyodideReady || (!prompt.trim() && !file && !repoUrl)) return;
    
    try {
        let fileData: FileData | undefined;
        if (file) { fileData = await readFileAsBase64(file); }
        
        const commandMatch = commandPaletteRoutes.find(r => prompt.startsWith(r.command));
        if (commandMatch) {
          onSendMessage(prompt.replace(commandMatch.command, '').trim(), fileData, repoUrl ?? undefined, commandMatch.task);
        } else {
          onSendMessage(prompt, fileData, repoUrl ?? undefined);
        }
    
        setPrompt(''); setFile(null); setRepoUrl(null);
    } catch (error) {
        console.error("Error during message submission:", error);
        alert(`An error occurred while preparing your message. Please try again.\n\nDetails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (file.type.startsWith('image/')) {
            setFile(file); // Keep image for normal sending
        } else {
            // This is a document for the archive
            try {
                const text = await file.text();
                await onEmbedFile(file.name, text);
                alert(`${file.name} has been embedded in your personal archive.`);
            } catch (err: any) {
                alert(`Failed to embed ${file.name}. Error: ${err.message}`);
            }
            if (fileInputRef.current) fileInputRef.current.value = ''; // Clear input
        }
    }
  };

  const handleRepoClick = async () => {
    const url = window.prompt("Enter GitHub repository URL (e.g., https://github.com/user/repo):");
    if (url && gitHubRepoRegex.test(url)) {
        const match = url.match(gitHubRepoRegex);
        const [_, owner, repo] = match!;
        const treeUrl = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;

        try {
            const treeResponse = await fetch(treeUrl);
            if (!treeResponse.ok) throw new Error(`GitHub API error: ${treeResponse.statusText}`);
            const treeData = await treeResponse.json();

            if (!treeData.tree || !Array.isArray(treeData.tree)) {
                throw new Error("Could not parse repository file tree. The repository might be empty or invalid.");
            }

            const filesToIngest = treeData.tree
                .map((file: any) => file.path)
                .filter((path: string) => 
                    (path.endsWith('.md') || path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.py') || path.endsWith('.txt')) && !path.includes('node_modules')
                );

            if (filesToIngest.length === 0) {
                alert("No ingestible files (.md, .ts, .js, .py, .txt) found in the main branch.");
                return;
            }

            if (window.confirm(`Ingest ${filesToIngest.length} relevant files from ${repo}? This may take a moment.`)) {
                for (const path of filesToIngest) {
                    const fileUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${path}`;
                    const fileContent = await (await fetch(fileUrl)).text();
                    await onEmbedFile(path, fileContent);
                }
                alert('Repository ingestion complete!');
            }
        } catch (e: any) {
            alert(`Failed to fetch repository. Error: ${e.message}`);
        }
    } else if (url) {
        alert("Invalid GitHub repository URL.");
    }
  };


  return (
    <div className="bg-card p-4 border-t border-border relative">
        {showCommandPalette && (
            <div className="absolute bottom-full left-4 right-4 mb-2 p-2 bg-background border border-border rounded-sm shadow-lg">
                <p className="text-xs text-foreground/60 px-2 pb-2">Select an agent to force routing:</p>
                {commandPaletteRoutes.map(route => (
                    <button key={route.command} 
                        onClick={() => handleCommandSelect(route.task, route.command)}
                        className="w-full text-left flex items-center gap-3 p-2 hover:bg-card rounded-sm"
                    >
                        <span className="font-mono text-accent text-sm">{route.command}</span>
                        <span className="text-sm text-foreground/80">{route.desc}</span>
                    </button>
                ))}
            </div>
        )}

        {(file || repoUrl) && (
          <div className="mb-2">
            {file && (
                <div className="flex items-center justify-between bg-background px-3 py-1.5 rounded-sm border border-border">
                    <span className="text-sm text-foreground/80">File: <span className="font-medium text-foreground">{file.name}</span></span>
                    <button onClick={() => setFile(null)} className="text-foreground/70 hover:text-white"><XCircleIcon /></button>
                </div>
            )}
            {repoUrl && (
                <div className="flex items-center justify-between bg-background px-3 py-1.5 rounded-sm border border-border mt-2">
                    <span className="text-sm text-foreground/80 flex items-center gap-2"><GitHubIcon className="w-4 h-4" /> Repo: <span className="font-medium text-foreground">{repoUrl.replace('https://github.com/', '')}</span></span>
                    <button onClick={() => setRepoUrl(null)} className="text-foreground/70 hover:text-white"><XCircleIcon /></button>
                </div>
            )}
          </div>
        )}

        <div className="flex items-center bg-background rounded-sm p-2 border border-border focus-within:ring-1 focus-within:ring-accent">
            <button onClick={() => fileInputRef.current?.click()} aria-label="Attach file" className="p-2 text-foreground/70 hover:text-white disabled:opacity-50" disabled={!isEmbedderReady}><PaperclipIcon /></button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button onClick={handleRepoClick} aria-label="Add GitHub repository" className="p-2 text-foreground/70 hover:text-white disabled:opacity-50" disabled={!isEmbedderReady}><GitHubIcon /></button>
            <textarea
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder="Type a message or '/' for commands..."
                className="flex-grow bg-transparent text-foreground placeholder-foreground/50 focus:outline-none resize-none px-3 font-mono"
                rows={1}
                disabled={isLoading || !isPyodideReady}
            />
            <button onClick={handleSubmit} aria-label="Send message" disabled={isLoading || (!prompt.trim() && !file && !repoUrl)} className="p-2 rounded-sm transition-colors disabled:opacity-50 enabled:bg-accent enabled:hover:bg-accent/80 text-white">
                <SendIcon />
            </button>
        </div>
    </div>
  );
};
