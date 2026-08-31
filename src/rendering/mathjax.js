import { ensureMathJax } from "./mathjax-entry.js";

let typesetQueue = Promise.resolve();

export function typesetMath(element) {
  if (!element || !/(?:\$|\\\(|\\\[)/.test(element.textContent ?? "")) {
    return Promise.resolve(false);
  }
  typesetQueue = typesetQueue
    .then(async () => {
      const mathJax = await ensureMathJax();
      await mathJax.typesetPromise([element]);
    })
    .then(() => true)
    .catch((error) => {
      console.warn("MathJax typesetting failed", error);
      return false;
    });
  return typesetQueue;
}
