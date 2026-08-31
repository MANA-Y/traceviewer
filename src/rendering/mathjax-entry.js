let mathJaxPromise = null;

export function ensureMathJax() {
  if (mathJaxPromise === null) {
    mathJaxPromise = import('./mathjax-runtime.js')
      .then(({ createMathJaxRuntime }) => createMathJaxRuntime());
  }
  return mathJaxPromise;
}
