
import React, { useState, useEffect, useRef } from 'react';
import { XCircleIcon, PlayIcon, StepOverIcon, StopIcon } from './Icons';

const PYTHON_DEBUGGER_SCRIPT = `
import sys
import bdb
import io
from js import update_js_state, wait_for_js_command, update_output

class JsDebugger(bdb.Bdb):
    def __init__(self):
        super().__init__()
        self._wait_for_mainpyfile = True
        self.stdout_capture = io.StringIO()
        self.original_stdout = sys.stdout

    def user_line(self, frame):
        if self._wait_for_mainpyfile:
            if (frame.f_code.co_filename != '<string>'):
                return

        # Capture and send stdout
        captured_output = self.stdout_capture.getvalue()
        if captured_output:
            update_output(captured_output)
            self.stdout_capture.seek(0)
            self.stdout_capture.truncate(0)

        # Extract state
        line_no = frame.f_lineno
        
        # Filter and format locals
        locals_copy = {}
        for k, v in frame.f_locals.items():
            if not k.startswith('__'):
                try:
                    locals_copy[k] = repr(v)
                except Exception:
                    locals_copy[k] = "Un-representable object"

        # Send state to JS and wait for command
        update_js_state(line_no, locals_copy)
        command = wait_for_js_command.wait()
        
        # Process command
        if command == 'next':
            self.set_next(frame)
        elif command == 'step':
            self.set_step()
        elif command == 'continue':
            self.set_continue()
        elif command == 'quit':
            self.set_quit()
        else:
            self.set_quit()
    
    def run_debug(self, code):
        sys.stdout = self.stdout_capture
        try:
            self.run(code)
        except Exception as e:
            update_output(f"Error during execution: {e}")
        finally:
            sys.stdout = self.original_stdout
            # Get any final output
            captured_output = self.stdout_capture.getvalue()
            if captured_output:
                update_output(captured_output)
        return self.stdout_capture.getvalue()

debugger_instance = JsDebugger()
`;

type DebuggerState = {
  line: number;
  variables: Record<string, string>;
  output: string;
  status: 'running' | 'waiting' | 'finished' | 'error';
};

const DebuggerModal: React.FC<{
  code: string;
  onComplete: (output: string) => void;
  onClose: () => void;
  pyodide: any;
}> = ({ code, onComplete, onClose, pyodide }) => {
  const [state, setState] = useState<DebuggerState>({
    line: 0,
    variables: {},
    output: '',
    status: 'running',
  });
  const commandPromiseResolver = useRef<(value: string) => void>(() => {});
  const fullOutput = useRef<string>("");

  useEffect(() => {
    if (!pyodide) return;

    // Expose JS functions to Python
    (window as any).update_js_state = (line: number, locals: any) => {
      try {
        setState(prev => ({
          ...prev,
          line,
          variables: pyodide.toJs(locals),
          status: 'waiting',
        }));
      } catch (e) {
        console.error("Failed to convert Python locals to JS:", e);
        setState(prev => ({ ...prev, status: 'error', output: `${prev.output}\n\nError converting Python state.` }));
      }
    };

    (window as any).update_output = (newOutput: string) => {
      fullOutput.current += newOutput;
      setState(prev => ({ ...prev, output: prev.output + newOutput }));
    };

    (window as any).wait_for_js_command = new Promise<string>((resolve) => {
      commandPromiseResolver.current = resolve;
    });

    const run = async () => {
      try {
        await pyodide.runPythonAsync(PYTHON_DEBUGGER_SCRIPT);
        await pyodide.globals.get('debugger_instance').run_debug(code);
        setState(prev => ({ ...prev, status: 'finished' }));
      } catch (e) {
        const error = e as Error;
        console.error("Debugger execution failed:", e);
        const errorMessage = `\n\nDEBUGGER FAILED: ${error.message}`;
        fullOutput.current += errorMessage;
        setState(prev => ({ ...prev, output: prev.output + errorMessage, status: 'error' }));
      }
    };

    run();

    return () => { // Cleanup
      delete (window as any).update_js_state;
      delete (window as any).wait_for_js_command;
      delete (window as any).update_output;
    }
  }, [pyodide, code]);

  const sendCommand = (cmd: string) => {
    if (state.status !== 'waiting') return;
    setState(prev => ({ ...prev, status: 'running' }));
    (window as any).wait_for_js_command = new Promise<string>((resolve) => {
      commandPromiseResolver.current = resolve;
    });
    commandPromiseResolver.current(cmd);
  };
  
  const handleFinish = (finalCommand: string) => {
    if (finalCommand === 'quit') {
        onComplete("Debugging session terminated by user.");
    } else {
        onComplete(fullOutput.current || "Code executed without output.");
    }
    onClose();
  };

  useEffect(() => {
    if (state.status === 'finished' || state.status === 'error') {
        handleFinish('continue');
    }
  }, [state.status]);

  const codeLines = code.split('\n');

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border w-full max-w-4xl h-[80vh] flex flex-col rounded-sm">
        {/* Header */}
        <div className="flex-shrink-0 flex justify-between items-center p-3 border-b border-border">
          <h2 className="text-lg font-sans font-semibold">Code Debugger</h2>
          <div className="flex items-center gap-2">
            <button disabled={state.status !== 'waiting'} onClick={() => sendCommand('continue')} className="flex items-center gap-1.5 px-3 py-1 bg-background enabled:hover:bg-border disabled:opacity-50 transition-colors rounded-sm text-xs"> <PlayIcon /> Continue</button>
            <button disabled={state.status !== 'waiting'} onClick={() => sendCommand('next')} className="flex items-center gap-1.5 px-3 py-1 bg-background enabled:hover:bg-border disabled:opacity-50 transition-colors rounded-sm text-xs"><StepOverIcon/> Step Over</button>
            <button onClick={() => handleFinish('quit')} className="flex items-center gap-1.5 px-3 py-1 bg-accent/80 hover:bg-accent disabled:opacity-50 transition-colors rounded-sm text-xs"><StopIcon/> Quit</button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-grow flex overflow-hidden">
          {/* Code Panel */}
          <div className="w-2/3 border-r border-border overflow-y-auto">
            <pre className="text-sm font-mono whitespace-pre-wrap">
              {codeLines.map((line, i) => (
                <div key={i} className={`flex items-center px-4 ${i + 1 === state.line ? 'bg-accent/20' : ''}`}>
                    <span className="text-right w-8 text-foreground/50 mr-4 select-none">{i + 1}</span>
                    <code className="flex-1">{line}</code>
                </div>
              ))}
            </pre>
          </div>

          {/* Side Panel (Vars & Output) */}
          <div className="w-1/3 flex flex-col">
            {/* Variables */}
            <div className="flex-1 border-b border-border overflow-y-auto">
                <h3 className="text-sm font-semibold p-3 sticky top-0 bg-card border-b border-border">Variables</h3>
                <div className="p-3">
                    {Object.entries(state.variables).length === 0 ? (
                         <p className="text-xs text-foreground/50">No variables in scope.</p>
                    ) : (
                        <table className="w-full text-xs">
                            <tbody>
                            {Object.entries(state.variables).map(([key, value]) => (
                                <tr key={key} className="font-mono border-b border-border/50">
                                    <td className="p-1 font-semibold text-foreground/80 align-top">{key}</td>
                                    <td className="p-1 text-foreground/70 break-all">{value}</td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Output */}
            <div className="flex-1 overflow-y-auto h-1/3">
                 <h3 className="text-sm font-semibold p-3 sticky top-0 bg-card border-b border-border">Console Output</h3>
                 <pre className="text-xs font-mono p-3 whitespace-pre-wrap break-all">{state.output || <span className="text-foreground/50">No output yet.</span>}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebuggerModal;
