import React, { useState } from 'react';
import { TaskType } from '../../types';

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
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border border-border w-full max-w-lg rounded-sm shadow-2xl">
                <div className="p-4 border-b border-border">
                    <h2 className="text-lg font-sans font-semibold">Fine-Tune Agent: {taskType}</h2>
                    <p className="text-sm text-foreground/70">How can this agent's responses be better? (This feedback will apply for the rest of the session)</p>
                </div>
                <div className="p-4">
                    <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="w-full h-24 p-2 bg-background border border-border rounded-sm text-foreground font-mono"
                        placeholder="e.g., 'Be more concise', 'Always include code examples'"
                    />
                </div>
                <div className="p-4 flex justify-end gap-3 border-t border-border">
                    <button onClick={onClose} className="px-3 py-1 bg-background hover:bg-border rounded-sm text-xs">Cancel</button>
                    <button onClick={handleSubmit} className="px-3 py-1 bg-accent hover:bg-accent/80 text-white rounded-sm text-xs">Submit Feedback</button>
                </div>
            </div>
        </div>
    );
};