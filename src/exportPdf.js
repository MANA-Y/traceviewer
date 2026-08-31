function waitFrames(nextFrame, count = 2) {
  let chain = Promise.resolve();
  for (let index = 0; index < count; index += 1) {
    chain = chain.then(() => new Promise((resolve) => nextFrame(resolve)));
  }
  return chain;
}

export function waitForPrintableMedia(doc, { nextFrame, timeoutMs = 4000 } = {}) {
  const frame = nextFrame ?? ((callback) => globalThis.requestAnimationFrame(callback));
  const images = [...doc.querySelectorAll('.presentation-mode img')];
  return Promise.all(images.map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        image.removeEventListener('load', finish);
        image.removeEventListener('error', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      image.addEventListener('load', finish);
      image.addEventListener('error', finish);
    });
  })).then(() => waitFrames(frame));
}

export async function exportPresentationPdf({
  document: doc = globalThis.document,
  targetWindow = globalThis,
  print,
  nextFrame,
  manageClass = true,
  afterPrintTimeoutMs = 120_000,
} = {}) {
  const root = doc.documentElement;
  const printFn = print ?? (() => targetWindow.print());
  const frame = nextFrame ?? ((callback) => targetWindow.requestAnimationFrame(callback));
  if (manageClass) root.classList.add('is-print-export');

  const cleanup = () => {
    if (manageClass) root.classList.remove('is-print-export');
    targetWindow.removeEventListener('afterprint', onAfterPrint);
  };

  let onAfterPrint = () => {};
  try {
    await waitForPrintableMedia(doc, { nextFrame: frame });
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve();
      };
      onAfterPrint = finish;
      const timer = setTimeout(finish, afterPrintTimeoutMs);
      targetWindow.addEventListener('afterprint', onAfterPrint);
      try {
        printFn();
      } catch (error) {
        clearTimeout(timer);
        cleanup();
        reject(error);
      }
    });
  } catch (error) {
    cleanup();
    throw error;
  }
}
