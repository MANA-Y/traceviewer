import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { CHTML } from 'mathjax-full/js/output/chtml.js';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';


let runtime = null;

export function createMathJaxRuntime() {
  if (runtime) return runtime;

  const adaptor = browserAdaptor();
  RegisterHTMLHandler(adaptor);
  const input = new TeX({
    packages: ['base'],
    inlineMath: [['$', '$'], ['\\(', '\\)']],
    displayMath: [['$$', '$$'], ['\\[', '\\]']],
    processEscapes: true,
    maxBuffer: 10 * 1024,
  });
  const fontURL = import.meta.env.DEV
    ? new URL('/mathjax-fonts/', window.location.origin).href
    : new URL('../mathjax-fonts/'.toString(), import.meta.url).href;
  const output = new CHTML({ fontURL });
  const mathDocument = mathjax.document(window.document, {
    InputJax: input,
    OutputJax: output,
  });

  runtime = {
    async typesetPromise(elements) {
      mathDocument.clearMathItemsWithin(elements);
      mathDocument.options.elements = elements;
      mathDocument.reset();
      await mathjax.handleRetriesFor(() => mathDocument.render());
    },
    typesetClear(elements) {
      mathDocument.clearMathItemsWithin(elements);
    },
  };
  return runtime;
}
