import React from 'react';
import { ChatMessage, FunctionCall, Plan, CritiqueResult, GroundingSource } from '../../types';
import { AgentGraphVisualizer } from './AgentGraphVisualizer';
import { CodeBracketIcon, PerceptionIcon, CritiqueIcon, SearchIcon } from '../../components/Icons';

export const Message: React.FC<{ 
    message: ChatMessage;
    onExecuteCode: (messageId: string, functionCallId: string) => void;
    onDebugCode: (messageId: string, functionCallId: string) => void;
    onExecutePlan: (plan: Plan) => void;
}> = ({ message, onExecuteCode, onDebugCode, onExecutePlan }) => {
  const isUser = message.role === 'user';

  const renderContent = (content: string) => content.split('\n').map((line, i) => <React.Fragment key={i}>{line}<br/></React.Fragment>);

  const renderSources = (sources: GroundingSource[]) => (
    <div className="mt-3 pt-3 border-t border-border/50">
      <h4 className="text-xs font-semibold text-foreground/80 mb-2 flex items-center gap-2"><SearchIcon className="w-4 h-4" /> Sources:</h4>
      <div className="flex flex-wrap gap-2">
        {sources.map((source, index) => (
          <a
            key={index}
            href={source.uri}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-background hover:bg-border px-2 py-1 rounded-sm transition-colors max-w-full"
            title={source.uri}
          >
            <div className="flex items-center gap-2">
              <span className="bg-card px-1.5 py-0.5 rounded-sm">{index + 1}</span>
              <span className="truncate">{source.title || new URL(source.uri).hostname}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
  
  const renderPlan = (plan: Plan) => (
    <div className="mt-2 space-y-3">
        <div className="flex justify-between items-center">
            <h4 className="text-sm font-semibold text-foreground/80">Generated Plan:</h4>
            <button 
                onClick={() => onExecutePlan(plan)}
                className="text-xs bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded-sm transition-colors"
            >
                Run This Plan
            </button>
        </div>
        {plan.plan.map((step) => (
            <div key={step.step_id} className="p-3 bg-card/50 rounded-sm border border-border">
                <p className="font-semibold text-foreground">Step {step.step_id}: {step.description}</p>
                <div className="mt-2 text-xs space-y-1 text-foreground/70">
                    <p>Tool: <span className="font-medium text-foreground/80">{step.tool_to_use}</span></p>
                </div>
            </div>
        ))}
    </div>
  );

  const renderCritique = (critique: CritiqueResult) => ( /* ... (implementation from v2.3 App.tsx) ... */ 
    <div className="mt-2 space-y-3">
        <h4 className="text-sm font-semibold text-foreground/80 flex items-center gap-2"><CritiqueIcon className="w-4 h-4" /> Self-Critique:</h4>
        <div className="p-3 bg-card/50 rounded-sm border border-border text-xs">
            <div className="flex justify-around text-center mb-2">
                <div><p className="font-bold">{critique.scores.faithfulness}/5</p><p>Faithfulness</p></div>
                <div><p className="font-bold">{critique.scores.coherence}/5</p><p>Coherence</p></div>
                <div><p className="font-bold">{critique.scores.coverage}/5</p><p>Coverage</p></div>
            </div>
            <p className="bg-background/50 p-2 rounded-sm">{critique.critique}</p>
        </div>
    </div>
  );

  const renderFunctionCalls = (functionCalls: FunctionCall[]) => ( /* ... (implementation from v2.3 App.tsx) ... */ 
      <div className="mt-2 space-y-3">
        {functionCalls.map((call) => {
            if (call.name === 'code_interpreter' && call.args.code) {
                return (
                    <div key={call.id} className="bg-background rounded-sm my-2 border border-border">
                        <div className="text-xs px-4 py-2 border-b flex items-center gap-2"><CodeBracketIcon className="w-4 h-4" />Tool Call: <b className="text-foreground">{call.name}</b></div>
                        <pre className="p-4 text-sm overflow-x-auto"><code>{call.args.code}</code></pre>
                        {call.isAwaitingExecution && (
                            <div className="px-4 py-2 border-t flex items-center gap-2">
                                <button onClick={() => onExecuteCode(message.id, call.id)} className="text-xs bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded-sm">Execute</button>
                                <button onClick={() => onDebugCode(message.id, call.id)} className="text-xs bg-card hover:bg-border px-3 py-1 rounded-sm border">Debug</button>
                            </div>
                        )}
                    </div>
                )
            }
            return ( /* Renders other tool calls */ <div key={call.id}>...</div> )
        })}
    </div>
  );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-xl px-1 ${!isUser && 'flex items-start space-x-3'}`}>
        {!isUser && message.role !== 'tool' && <div className="w-8 h-8 rounded-sm bg-accent flex-shrink-0 mt-1"></div>}
        <div className={`rounded-sm px-4 py-3 ${isUser ? 'bg-user-bubble' : 'bg-card'}`}>
          <div className="prose prose-invert prose-sm max-w-none text-foreground">
            {message.plan ? renderPlan(message.plan)
              : message.functionCalls && message.functionCalls.length > 0 ? renderFunctionCalls(message.functionCalls)
              : message.critique ? renderCritique(message.critique)
              : message.role === 'tool' ? <pre>Tool Output: {JSON.stringify(message.functionResponse?.response, null, 2)}</pre>
              : renderContent(message.content)}
          </div>
          {message.isLoading && message.taskType && <AgentGraphVisualizer taskType={message.taskType} activeStep={message.currentStep ?? 0} />}
          {message.sources && message.sources.length > 0 && renderSources(message.sources)}
        </div>
      </div>
    </div>
  );
};