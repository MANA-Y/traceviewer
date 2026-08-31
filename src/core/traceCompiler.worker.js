import { compileTrace } from './compileTrace.js';
import { validateTrace } from './trace.js';


self.addEventListener('message', (event) => {
  try {
    const trace = validateTrace(event.data.trace);
    self.postMessage({ id: event.data.id, trace, compiledTrace: compileTrace(trace) });
  } catch (error) {
    self.postMessage({
      id: event.data.id,
      error: { name: error.name, message: error.message, stack: error.stack },
    });
  }
});
