import { compileTrace } from './compileTrace.js';
import { validateTrace } from './trace.js';


let requestId = 0;

function createCompilerWorker() {
  return new Worker(
    new URL('./traceCompiler.worker.js', import.meta.url),
    { type: 'module', name: 'trace-compiler' },
  );
}

export async function compileTraceAsync(
  input,
  workerFactory = typeof globalThis.Worker === 'function' ? createCompilerWorker : null,
) {
  if (typeof workerFactory !== 'function') {
    const trace = validateTrace(input);
    return { trace, compiledTrace: compileTrace(trace) };
  }
  const worker = workerFactory();
  const id = ++requestId;
  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.addEventListener('message', (event) => {
      if (event.data?.id !== id) return;
      finish();
      if (event.data.error) {
        const error = new Error(event.data.error.message);
        error.name = event.data.error.name || 'Error';
        reject(error);
      } else {
        resolve({ trace: event.data.trace, compiledTrace: event.data.compiledTrace });
      }
    });
    worker.addEventListener('error', (event) => {
      finish();
      reject(event.error ?? new Error(event.message || 'Trace compiler worker failed'));
    });
    worker.postMessage({ id, trace: input });
  });
}
