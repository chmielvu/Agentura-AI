import React, { useState } from 'react';
import { TaskType } from '../../types';
import { XCircleIcon } from '../../components/Icons';

interface Props {
    taskType: TaskType;
    onClose: () => void;
    onSubmit: (feedback: string) => void;
}

export const FeedbackModal: React.FC<Props> = ({ taskType, onClose, onSubmit }) => {
    const [feedback, setFeedback] = useState('');

    const handleSubmit = () => {
        if (!feedback.trim()) return;
        onSubmit(feedback);
    };

    return (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-card p-6 shadow-lg sm:rounded-lg"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 className="text-lg font-sans font-semibold leading-none tracking-tight">Fine-Tune Agent: {taskType}</h2>
                    <p className="text-sm text-muted-foreground">How can this agent's responses be better? (This feedback will apply for the rest of the session)</p>
                </div>
                
                <div className="p-0">
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        placeholder="e.g., 'Be more concise', 'Always include code examples'"
                    />
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                    <button onClick={onClose} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors h-10 px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80">Cancel</button>
                    <button onClick={handleSubmit} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors h-10 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90">Submit Feedback</button>
                </div>
                <button onClick={onClose} className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                    <XCircleIcon className="h-5 w-5" />
                    <span className="sr-only">Close</span>
                </button>
            </div>
        </div>
    );
};