
import React from 'react';
import { ChatMessage, FunctionCall, Plan, CritiqueResult, GroundingSource, RepoData, RagSource, TaskType } from '../../types';
import { CodeBracketIcon, PerceptionIcon, CritiqueIcon, SearchIcon, PlayIcon, RetryIcon, GitHubIcon, BrainCircuitIcon, ClockIcon, CogIcon, CheckCircleIcon, XCircleIcon } from '../../components/Icons';
import { Visualization } from './Visualization';
import { AGENT_ROSTER } from '../../constants';
import { taskToIcon } from './AgentRoster';

export const Message: React.FC<{ 
    message: ChatMessage;
    onExecuteCode: (messageId: string, functionCallId: string) => void;
    onExecutePlan: (plan: Plan) => void;
    onRetryPlan: (plan: Plan) => void;
    onRequestFeedback: (messageId: string, taskType: TaskType) => void;
}> = ({ message, onExecuteCode, onExecutePlan, onRetryPlan, onRequestFeedback }) => {
  const isUser = message.role === 'user';

  const renderContent = (content: string) => (
    <>
      {content.split('\n').map((line, i) => <React.Fragment key={i}>{line}<br/></React.Fragment>)}
      {message.isLoading && <span className="animate-pulse">|</span>}
    </>
  );
  
  const renderSupervisorReport = (report: string) => (
    <div className="mt-3 pt-3 border-t border-border/50">
      <details className="text-xs">
        <summary className="cursor-pointer font-semibold text-foreground/80 mb-2 flex items-center gap-2">
          <BrainCircuitIcon className="w-4 h-4" /> Supervisor's Report
        </summary>
        <div className="mt-2 p-3 bg-background/50 rounded-sm border border-border/50">
          <pre className="whitespace-pre-wrap font-mono text-foreground/70">{report}</pre>
        </div>
      </details>
    </div>
  );

  const renderRepo = (repo: RepoData) => (
    <div className="mb-2">
      <div className="text-xs font-semibold text-foreground/80 mb-1 flex items-center gap-2"><GitHubIcon className="w-4 h-4" /> Repository Provided:</div>
      <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-sm bg-background hover:bg-border px-3 py-2 rounded-sm transition-colors block">
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
          <a key={index} href={source.uri} target="_blank" rel="noopener noreferrer" className="text-xs bg-background hover:bg-border px-2 py-1 rounded-sm transition-colors max-w-full" title={source.uri}>
            <div className="flex items-center gap-2">
              <span className="bg-card px-1.5 py-0.5 rounded-sm">{index + 1}</span>
              <span className="truncate">{source.title || new URL(source.uri).hostname}</span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );

  const renderRagSources = (sources: RagSource[]) => (
    <div className="mt-3 pt-3 border-t border-border/50">
      <h4 className="text-xs font-semibold text-foreground/80 mb-2 flex items-center gap-2"><PerceptionIcon className="w-4 h-4" /> Grounded in Documents:</h4>
      <div className="space-y-2">
        {sources.map((source, index) => (
          <details key={index} className="text-xs bg-background/50 rounded-sm border border-border/50">
            <summary className="cursor-pointer font-medium text-foreground/80 p-2">{source.documentName}</summary>
            <p className="p-2 pt-2 mt-2 border-t border-border/50 text-foreground/70 whitespace-pre-wrap">{source.chunkContent}</p>
          </details>
        ))}
      </div>
    </div>
  );

  const renderPlan = (plan: Plan) => {
    const hasFailedStep = plan.plan.some(p => p.status === 'failed');
    const isRunning = plan.plan.some(p => p.status === 'in-progress');
    const isComplete = plan.plan.every(p => p.status === 'completed');
    const isPending = !isComplete && plan.plan.every(p => p.status === 'pending' || p.result === 'Validated.');

    let overallStatus = "";
    if (hasFailedStep) overallStatus = "Plan Failed";
    else if (isRunning) overallStatus = "Plan Executing...";
    else if (isComplete) overallStatus = "Plan Complete";
    else if (isPending) overallStatus = "Awaiting Execution";

    return (
      <div className="mt-2 space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <h4 className="text-sm font-semibold text-foreground/80">Execution Plan:</h4>
            {overallStatus && <p className="text-xs text-foreground/70">{overallStatus}</p>}
          </div>
          {isPending && !hasFailedStep && (
            <button onClick={() => onExecutePlan(plan)} className="text-xs bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded-sm transition-colors flex items-center gap-1.5"><PlayIcon className="w-3 h-3"/> Run Plan</button>
          )}
          {hasFailedStep && (
            <button onClick={() => onRetryPlan(plan)} className="text-xs bg-yellow-600/80 hover:bg-yellow-600 text-white px-3 py-1 rounded-sm transition-colors flex items-center gap-1.5"><RetryIcon className="w-3 h-3"/> Self-Correct & Retry</button>
          )}
        </div>
        {plan.plan.map((step) => {
          const duration = step.startTime && step.endTime ? `${((step.endTime - step.startTime) / 1000).toFixed(2)}s` : null;
          let StatusIcon, statusColor = "text-foreground/60";
          switch (step.status) {
            case 'in-progress': StatusIcon = CogIcon; statusColor = 'text-accent animate-spin'; break;
            case 'completed': StatusIcon = CheckCircleIcon; statusColor = 'text-green-500'; break;
            case 'failed': StatusIcon = XCircleIcon; statusColor = 'text-red-500'; break;
            default: StatusIcon = ClockIcon;
          }
          const hasResult = step.result && step.result !== 'Validated.' && step.result !== 'Executing...';

          return (
            <div key={step.step_id} className={`p-3 bg-card/70 rounded-sm border ${step.status === 'failed' ? 'border-accent' : 'border-border'}`}>
              <div className="flex items-start gap-3">
                <StatusIcon className={`w-5 h-5 mt-1 flex-shrink-0 ${statusColor}`} />
                <div className="flex-1">
                  <p className="font-semibold text-foreground">Step {step.step_id}: {step.description}</p>
                  <div className="text-xs text-foreground/70 mt-1">
                    Tool: <span className="font-medium text-foreground/80">{step.tool_to_use}</span>
                    {duration && <span className="ml-2 pl-2 border-l border-border/50">Duration: {duration}</span>}
                  </div>
                </div>
              </div>
              {hasResult && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className={`text-xs mb-1 font-semibold ${step.status === 'failed' ? 'text-red-400' : 'text-foreground/60'}`}>Result:</p>
                  <pre className="text-xs whitespace-pre-wrap font-mono bg-background p-2 rounded-sm max-h-40 overflow-y-auto">
                    <code>{step.result}{step.status === 'in-progress' && <span className="animate-pulse">|</span>}</code>
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderCritique = (critique: CritiqueResult) => (
    <div className="mt-2 space-y-3">
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
                            </div>
                        )}
                    </div>
                )
            }
            return ( <div key={call.id} className="text-xs text-foreground/70">(Mock tool call: {call.name})</div> )
        })}
    </div>
  );
  
  const isSwarmFailure = message.role === 'assistant' && (message.content.includes("Swarm execution failed") || message.content.includes("Plan FAILED"));
  const agentConfig = message.taskType ? AGENT_ROSTER[message.taskType] : null;
  const AgentIcon = agentConfig && message.taskType ? taskToIcon[message.taskType] : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-full px-1 ${!isUser && 'flex items-start space-x-3'}`}>
        {!isUser && message.role !== 'tool' && <div className="w-8 h-8 rounded-sm bg-accent flex-shrink-0 mt-1"></div>}
        <div className={`rounded-sm px-4 py-3 ${isUser ? 'bg-user-bubble' : 'bg-card'} ${isSwarmFailure ? 'border border-accent' : ''} w-full`}>
          
          {agentConfig && !message.plan && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border/50">
              {AgentIcon && <AgentIcon className="w-5 h-5 text-accent" />}
              <h3 className="text-sm font-bold text-foreground/90">{agentConfig.title}</h3>
            </div>
          )}
          
          <div className="prose prose-invert prose-sm max-w-none text-foreground">
            {message.repo && renderRepo(message.repo)}
            {message.plan ? renderPlan(message.plan)
              : message.functionCalls && message.functionCalls.length > 0 ? renderFunctionCalls(message.functionCalls)
              : message.critique ? renderCritique(message.critique)
              : message.role === 'tool' ? <pre>Tool Output: {JSON.stringify(message.functionResponse?.response, null, 2)}</pre>
              : renderContent(message.content)}
            {message.vizSpec && <Visualization spec={message.vizSpec} />}
          </div>
          
          {message.sources && message.sources.length > 0 && renderSources(message.sources)}
          {message.ragSources && message.ragSources.length > 0 && renderRagSources(message.ragSources)}
          {message.supervisorReport && renderSupervisorReport(message.supervisorReport)}
          {!isUser && message.role !== 'tool' && message.taskType && message.taskType !== TaskType.Critique && !message.isLoading && (
            <div className="mt-2 pt-2 border-t border-border/50">
                <button 
                    onClick={() => onRequestFeedback(message.id, message.taskType!)}
                    className="text-xs text-foreground/60 hover:text-white transition-colors"
                    title="Provide feedback to fine-tune this agent"
                >
                    Provide Feedback
                </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
