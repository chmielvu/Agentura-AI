import React from 'react';
import { ChatMessage, FunctionCall, Plan, PlanStep, CritiqueResult, GroundingSource, RepoData } from '../../types';
import { AgentGraphVisualizer } from './AgentGraphVisualizer';
import { CodeBracketIcon, PerceptionIcon, CritiqueIcon, SearchIcon, PlayIcon, RetryIcon, GitHubIcon } from '../../components/Icons';
import { Visualization } from './Visualization';

export const Message: React.FC<{ 
    message: ChatMessage;
    onExecuteCode: (messageId: string, functionCallId: string) => void;
    onDebugCode: (messageId: string, functionCallId: string) => void;
    onExecutePlan: (plan: Plan) => void;
    onRetryPlan: (plan: Plan) => void;
}> = ({ message, onExecuteCode, onDebugCode, onExecutePlan, onRetryPlan }) => {
  const isUser = message.role === 'user';

  const renderContent = (content: string) => {
    const parts = content.split('\n').map((line, i) => <React.Fragment key={i}>{line}<br/></React.Fragment>);
    return (
        <>
            {parts}
            {message.isLoading && <span className="animate-pulse">|</span>}
        </>
    );
  };

  const renderRepo = (repo: RepoData) => (
    <div className="mb-2">
      <div className="text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-2"><GitHubIcon className="w-4 h-4" /> Repository Provided:</div>
      <a
        href={repo.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm bg-background hover:bg-border px-3 py-2 rounded-sm transition-colors block"
      >
        <span className="font-mono font-bold text-accent">{repo.owner}</span>
        <span className="font-mono text-foreground/80">/</span>
        <span className="font-mono font-bold text-accent">{repo.repo}</span>
      </a>
    </div>
  );

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
  
  const renderPlanStepStatus = (status: PlanStep['status']) => {
    switch (status) {
        case 'pending':
            return <span className="text-xs font-mono text-foreground/60">[PENDING]</span>;
        case 'in-progress':
            return <span className="text-xs font-mono text-accent animate-pulse">[RUNNING...]</span>;
        case 'completed':
            return <span className="text-xs font-mono text-green-500">[DONE]</span>;
        case 'failed':
            return <span className="text-xs font-mono text-red-500">[FAILED]</span>;
        default:
            return null;
    }
  }

  const renderPlan = (plan: Plan) => {
    const hasFailedStep = plan.plan.some(p => p.status === 'failed');
    const allPending = plan.plan.every(p => p.status === 'pending');

    return (
        <div className="mt-2 space-y-3">
            <div className="flex justify-between items-center">
                <h4 className="text-sm font-semibold text-foreground/80">Generated Plan:</h4>
                {allPending && (
                    <button 
                        onClick={() => onExecutePlan(plan)}
                        className="text-xs bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded-sm transition-colors flex items-center gap-1.5"
                    >
                        <PlayIcon className="w-3 h-3"/> Run This Plan
                    </button>
                )}
                {hasFailedStep && (
                     <button 
                        onClick={() => onRetryPlan(plan)}
                        className="text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white px-3 py-1 rounded-sm transition-colors flex items-center gap-1.5"
                    >
                        <RetryIcon className="w-3 h-3"/> Retry Failed Steps
                    </button>
                )}
            </div>
            {plan.plan.map((step) => (
                <div key={step.step_id} className="p-3 bg-card/50 rounded-sm border border-border">
                    <div className="flex justify-between items-start">
                        <p className="font-semibold text-foreground flex-1">Step {step.step_id}: {step.description}</p>
                        {renderPlanStepStatus(step.status)}
                    </div>
                    <div className="mt-2 text-xs space-y-1 text-foreground/70">
                        <p>Tool: <span className="font-medium text-foreground/80">{step.tool_to_use}</span></p>
                    </div>
                </div>
            ))}
        </div>
    );
  };

  const renderCritique = (critique: CritiqueResult) => (
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

  const renderFunctionCalls = (functionCalls: FunctionCall[]) => (
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
            return ( <div key={call.id} className="text-xs text-foreground/70">(Mock tool call: {call.name})</div> )
        })}
    </div>
  );

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-xl px-1 ${!isUser && 'flex items-start space-x-3'}`}>
        {!isUser && message.role !== 'tool' && <div className="w-8 h-8 rounded-sm bg-accent flex-shrink-0 mt-1"></div>}
        <div className={`rounded-sm px-4 py-3 ${isUser ? 'bg-user-bubble' : 'bg-card'}`}>
          <div className="prose prose-invert prose-sm max-w-none text-foreground">
            {message.repo && renderRepo(message.repo)}
            {message.plan ? renderPlan(message.plan)
              : message.functionCalls && message.functionCalls.length > 0 ? renderFunctionCalls(message.functionCalls)
              : message.critique ? renderCritique(message.critique)
              : message.role === 'tool' ? <pre>Tool Output: {JSON.stringify(message.functionResponse?.response, null, 2)}</pre>
              : renderContent(message.content)}
            {message.vizSpec && <Visualization spec={message.vizSpec} />}
          </div>
          {message.isLoading && message.taskType && message.workflowState && <AgentGraphVisualizer taskType={message.taskType} workflowState={message.workflowState} />}
          {message.sources && message.sources.length > 0 && renderSources(message.sources)}
        </div>
      </div>
    </div>
  );
};