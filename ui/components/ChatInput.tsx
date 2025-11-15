
import React, { useState, useRef } from 'react';
import { FileData, TaskType } from '../../types';
import { readFileAsBase64 } from '../hooks/helpers';
import { SendIcon, PaperclipIcon, XCircleIcon, GitHubIcon } from '../../components/Icons';
import { useAppContext } from '../context/AppProvider'; // Import the context hook

const gitHubRepoRegex = /https?:\/\/github\.com\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)/;

// Allowed text MIME types for embedding
const ALLOWED_TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/javascript',
  'text/x-python',
  'text/html',
  'application/x-javascript',
  'text/javascript',
];

// All props are removed
export const ChatInput: React.FC = () => {
  // Get all state and handlers from the global context
  const {
    handleSendMessage,
    isLoading,
    isEmbedderReady,
    handleEmbedFile,
    handleIngestRepo,
    embeddingStatus
  } = useAppContext();

  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const isEmbedding = !!embeddingStatus;
  const isPyodideReady = true; // Pyodide is removed, assume always ready

  const commandPaletteRoutes = [
      { command: '/code', task: TaskType.Code, desc: 'Generate or execute code' },
      { command: '/research', task: TaskType.Research, desc: 'Search the web for info' },
      { command: '/plan', task: TaskType.Planner, desc: 'Create a multi-step plan' },
      { command: '/creative', task: TaskType.Creative, desc: 'Generate creative content' },
      { command: '/add_agent', task: TaskType.Meta, desc: 'Create a new agent' },
  ];

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newPrompt = e.target.value;
      setPrompt(newPrompt);
      setShowCommandPalette(newPrompt.startsWith('/'));
  };

  const handleCommandSelect = (task: TaskType, command: string) => {
      handleSendMessage(prompt.replace(command, '').trim(), undefined, undefined, task);
      setPrompt('');
      setShowCommandPalette(false);
  }

  const handleSubmit = async () => {
    if (isLoading || isEmbedding || !isPyodideReady || (!prompt.trim() && !file)) return;
    
    try {
        let fileData: FileData | undefined;
        if (file) { fileData = await readFileAsBase64(file); }
        
        const commandMatch = commandPaletteRoutes.find(r => prompt.startsWith(r.command));
        if (commandMatch) {
          handleSendMessage(prompt.replace(commandMatch.command, '').trim(), fileData, undefined, commandMatch.task);
        } else {
          handleSendMessage(prompt, fileData, undefined);
        }
    
        setPrompt(''); setFile(null);
    } catch (error) {
        console.error("Error during message submission:", error);
    }
  };
  
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const selectedFile = e.target.files[0];

        const isImage = selectedFile.type.startsWith('image/');
        const isTextForEmbedding = ALLOWED_TEXT_MIME_TYPES.includes(selectedFile.type);

        if (isImage) {
            setFile(selectedFile);
        } else if (isTextForEmbedding) {
            try {
                const text = await selectedFile.text();
                await handleEmbedFile(selectedFile.name, text);
            } catch (err) {
                const error = err as Error;
                alert(`Failed to process ${selectedFile.name}. Error: ${error.message}`);
            }
        } else {
            alert(`Unsupported file type: "${selectedFile.type}". Please select an image or a valid text file (.txt, .md, .csv, .json, .js, .py).`);
        }

        if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRepoClick = async () => {
    const url = window.prompt("Enter GitHub repository URL (e.g., https://github.com/user/repo):");
    if (url && gitHubRepoRegex.test(url)) {
        await handleIngestRepo(url);
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

        {embeddingStatus && (
          <div className="mb-2 p-3 bg-background border border-border rounded-sm text-sm">
            <div className="flex justify-between items-center mb-1">
              <p className="text-foreground/80 truncate font-semibold">{embeddingStatus.title}</p>
              <p className="text-foreground/60 flex-shrink-0">{embeddingStatus.progress} / {embeddingStatus.total}</p>
            </div>
            <div className="w-full bg-border h-1.5 rounded-sm overflow-hidden">
              <div
                className="bg-accent h-1.5 rounded-sm transition-all duration-300"
                style={{ width: `${(embeddingStatus.progress / embeddingStatus.total) * 100}%` }}
              ></div>
            </div>
          </div>
        )}

        {file && (
          <div className="mb-2">
            <div className="flex items-center justify-between bg-background px-3 py-1.5 rounded-sm border border-border">
                <span className="text-sm text-foreground/80">File: <span className="font-medium text-foreground">{file.name}</span></span>
                <button onClick={() => setFile(null)} className="text-foreground/70 hover:text-white"><XCircleIcon /></button>
            </div>
          </div>
        )}

        <div className="flex items-center bg-background rounded-sm p-2 border border-border focus-within:ring-1 focus-within:ring-accent">
            <button onClick={() => fileInputRef.current?.click()} aria-label="Attach file" className="p-2 text-foreground/70 hover:text-white disabled:opacity-50" disabled={!isEmbedderReady || isEmbedding}><PaperclipIcon /></button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button onClick={handleRepoClick} aria-label="Add GitHub repository" className="p-2 text-foreground/70 hover:text-white disabled:opacity-50" disabled={!isEmbedderReady || isEmbedding}><GitHubIcon /></button>
            <textarea
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                placeholder="Type a message or '/' for commands..."
                className="flex-grow bg-transparent text-foreground placeholder-foreground/50 focus:outline-none resize-none px-3 font-mono"
                rows={1}
                disabled={isLoading || !isPyodideReady || isEmbedding}
            />
            <button onClick={handleSubmit} aria-label="Send message" disabled={isLoading || isEmbedding || (!prompt.trim() && !file)} className="p-2 rounded-sm transition-colors disabled:opacity-50 enabled:bg-accent enabled:hover:bg-accent/80 text-white">
                <SendIcon />
            </button>
        </div>
    </div>
  );
};
