import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPresentationPdf, waitForPrintableMedia } from '../src/exportPdf.js';

function createClassList() {
  const names = new Set();
  return {
    names,
    add: (name) => names.add(name),
    remove: (name) => names.delete(name),
  };
}

test('waits for pending images before resolving printable media', async () => {
  const listeners = { load: null, error: null };
  const image = {
    complete: false,
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: (type) => { listeners[type] = null; },
  };
  const pending = waitForPrintableMedia(
    { querySelectorAll: () => [image] },
    { nextFrame: (callback) => callback() },
  );
  let settled = false;
  pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  listeners.load();
  await pending;
  assert.equal(settled, true);
});

test('prepares the document, prints, then removes the export class', async () => {
  const classList = createClassList();
  const listeners = new Map();
  const targetWindow = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  let printed = 0;

  await exportPresentationPdf({
    document: {
      documentElement: { classList },
      querySelectorAll: () => [],
    },
    targetWindow,
    nextFrame: (callback) => callback(),
    print: () => {
      printed += 1;
      assert.equal(classList.names.has('is-print-export'), true);
      listeners.get('afterprint')?.();
    },
  });

  assert.equal(printed, 1);
  assert.equal(classList.names.has('is-print-export'), false);
  assert.equal(listeners.has('afterprint'), false);
});

test('waits for afterprint before resolving', async () => {
  const classList = createClassList();
  const listeners = new Map();
  const targetWindow = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  let resolved = false;
  const pending = exportPresentationPdf({
    document: {
      documentElement: { classList },
      querySelectorAll: () => [],
    },
    targetWindow,
    nextFrame: (callback) => callback(),
    print: () => {},
    afterPrintTimeoutMs: 5_000,
  }).then(() => { resolved = true; });

  while (!listeners.has('afterprint')) {
    await Promise.resolve();
  }
  assert.equal(resolved, false);
  assert.equal(classList.names.has('is-print-export'), true);
  listeners.get('afterprint')();
  await pending;
  assert.equal(resolved, true);
});

test('removes the export class if print preparation fails', async () => {
  const classList = createClassList();
  await assert.rejects(() => exportPresentationPdf({
    document: {
      documentElement: { classList },
      querySelectorAll: () => { throw new Error('query failed'); },
    },
    targetWindow: {
      addEventListener() {},
      removeEventListener() {},
    },
    nextFrame: (callback) => callback(),
  }), /query failed/);
  assert.equal(classList.names.has('is-print-export'), false);
});
