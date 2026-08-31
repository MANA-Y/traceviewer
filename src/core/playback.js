const COMMANDS = new Set([
  "next",
  "previous",
  "presentationNext",
  "presentationPrevious",
  "stepOverNext",
  "stepOverPrevious",
  "stepOut",
]);

export function getFileId(path) {
  return `file:${encodeURIComponent(path)}`;
}

export function getLocationId(path, lineNumber) {
  return JSON.stringify([getFileId(path), lineNumber]);
}

function internLegacyIdentity(interner, value) {
  const key = JSON.stringify(value);
  let id = interner.get(key);
  if (id === undefined) {
    id = `legacy:${interner.size}`;
    interner.set(key, id);
  }
  return id;
}

function getLegacyInvocationIds(stack, interner) {
  const result = [];
  let callerContext = "root";
  for (const frame of stack) {
    const invocationId = internLegacyIdentity(
      interner,
      [callerContext, frame.path, frame.function_name],
    );
    result.push(invocationId);
    callerContext = internLegacyIdentity(interner, [invocationId, frame.line_number]);
  }
  return result;
}

function getInvocationIds(stack, legacyInterner) {
  if (stack.every((frame) => frame.invocation_id !== null && frame.invocation_id !== undefined)) {
    return stack.map((frame) => JSON.stringify([frame.path, frame.invocation_id]));
  }
  return getLegacyInvocationIds(stack, legacyInterner);
}

function chooseNearest(ids, occurrences, select, fallback) {
  let result = fallback;
  for (const id of ids) {
    const candidate = occurrences.get(id);
    if (candidate !== undefined) {
      result = select(result, candidate);
    }
  }
  return result;
}

const ENVIRONMENT_CHECKPOINT_INTERVAL = 128;
const EMPTY_ENVIRONMENT = Object.freeze({ parent: null, delta: Object.freeze({}), depth: 0 });

function appendEnvironment(previous, delta) {
  if (Object.keys(delta).length === 0) return previous;
  if (previous.depth >= ENVIRONMENT_CHECKPOINT_INTERVAL) {
    return Object.freeze({
      parent: EMPTY_ENVIRONMENT,
      delta: Object.freeze({ ...materializeEnvironment(previous), ...delta }),
      depth: 1,
    });
  }
  return Object.freeze({
    parent: previous,
    delta: Object.freeze({ ...delta }),
    depth: previous.depth + 1,
  });
}

export function materializeEnvironment(environment) {
  const chain = [];
  for (let current = environment; current !== null; current = current.parent) {
    chain.push(current.delta);
  }
  const result = {};
  for (let index = chain.length - 1; index >= 0; index--) {
    Object.assign(result, chain[index]);
  }
  return result;
}

export function compilePlayback(trace) {
  const count = trace.steps.length;
  const presentationSteps = trace.presentationSteps ?? Array.from(
    { length: count },
    (_value, index) => index,
  );
  const legacyInterner = new Map();
  const identities = trace.steps.map((step) => {
    const frame = step.stack.at(-1);
    const invocationIds = getInvocationIds(step.stack, legacyInterner);
    return {
      fileId: getFileId(frame.path),
      locationId: getLocationId(frame.path, frame.line_number),
      invocationId: invocationIds.at(-1),
      invocationIds,
    };
  });

  const environments = new Array(count);
  const environmentByInvocation = new Map();
  for (let index = 0; index < count; index++) {
    const invocationId = identities[index].invocationId;
    const previous = environmentByInvocation.get(invocationId) ?? EMPTY_ENVIRONMENT;
    const delta = trace.steps[index].env ?? {};
    const environment = appendEnvironment(previous, delta);
    environmentByInvocation.set(invocationId, environment);
    environments[index] = environment;
  }

  const stepOverNext = new Int32Array(count).fill(-1);
  const stepOut = new Int32Array(count).fill(-1);
  const nextOccurrence = new Map();
  for (let index = count - 1; index >= 0; index--) {
    const ancestors = identities[index].invocationIds;
    stepOverNext[index] = chooseNearest(ancestors, nextOccurrence, Math.min, count);
    stepOut[index] = chooseNearest(ancestors.slice(0, -1), nextOccurrence, Math.min, count);
    nextOccurrence.set(identities[index].invocationId, index);
  }

  const stepOverPrevious = new Int32Array(count).fill(-1);
  const previousOccurrence = new Map();
  for (let index = 0; index < count; index++) {
    stepOverPrevious[index] = chooseNearest(
      identities[index].invocationIds,
      previousOccurrence,
      Math.max,
      -1,
    );
    previousOccurrence.set(identities[index].invocationId, index);
  }

  // Presentation playback is deliberately sparse. A trace may contain many
  // execution events between two rendered pieces of content (for example a
  // benchmark loop), but the audience-facing arrows should move directly to
  // the next content step. Source mode continues to use raw next/previous.
  const presentationNext = new Int32Array(count).fill(-1);
  const presentationPositionByStep = new Int32Array(count);
  const presentationPrevious = new Int32Array(count).fill(-1);
  let presentationCursor = 0;
  let previousPresentationStep = -1;
  for (let index = 0; index < count; index++) {
    while (presentationCursor < presentationSteps.length &&
           presentationSteps[presentationCursor] <= index) {
      previousPresentationStep = presentationSteps[presentationCursor];
      presentationCursor++;
    }
    presentationPrevious[index] = previousPresentationStep < index
      ? previousPresentationStep
      : presentationSteps[presentationCursor - 2] ?? -1;
    presentationNext[index] = presentationSteps[presentationCursor] ?? -1;
    presentationPositionByStep[index] = Math.max(presentationCursor - 1, 0);
  }

  const stepsByLocation = new Map();
  for (let index = 0; index < count; index++) {
    const locationId = identities[index].locationId;
    const indices = stepsByLocation.get(locationId) ?? [];
    indices.push(index);
    stepsByLocation.set(locationId, indices);
  }

  return {
    environments,
    identities,
    presentationNext,
    presentationPositionByStep,
    presentationPrevious,
    presentationSteps,
    stepCount: count,
    stepOut,
    stepOverNext,
    stepOverPrevious,
    stepsByLocation,
  };
}

export function snapToPresentationStep(playback, stepIndex) {
  const steps = playback.presentationSteps;
  if (!Array.isArray(steps) || steps.length === 0 || !Number.isInteger(stepIndex)) {
    return stepIndex;
  }
  const position = playback.presentationPositionByStep[stepIndex];
  if (steps[position] === stepIndex) {
    return stepIndex;
  }
  const previous = playback.presentationPrevious[stepIndex];
  if (previous >= 0) {
    return previous;
  }
  const next = playback.presentationNext[stepIndex];
  return next >= 0 ? next : steps[0];
}

export function transition(playback, stepIndex, command) {
  if (!Number.isInteger(stepIndex) || playback.stepCount === 0) {
    return null;
  }
  if (typeof command === "object" && command?.type === "seek") {
    return Math.min(Math.max(command.stepIndex, 0), playback.stepCount - 1);
  }
  if (!COMMANDS.has(command)) {
    throw new TypeError(`Unknown playback command: ${String(command)}`);
  }

  const targets = {
    next: stepIndex + 1,
    previous: stepIndex - 1,
    presentationNext: playback.presentationNext[stepIndex],
    presentationPrevious: playback.presentationPrevious[stepIndex],
    stepOverNext: playback.stepOverNext[stepIndex],
    stepOverPrevious: playback.stepOverPrevious[stepIndex],
    stepOut: playback.stepOut[stepIndex],
  };
  const target = targets[command];
  return target >= 0 && target < playback.stepCount ? target : stepIndex;
}

export function findLocationStep(playback, path, lineNumber, currentStepIndex, direction) {
  const indices = playback.stepsByLocation.get(getLocationId(path, lineNumber)) ?? [];
  if (direction > 0) {
    return indices.find((index) => index > currentStepIndex) ?? null;
  }
  return indices.findLast((index) => index <= currentStepIndex) ?? null;
}

export function mapSemanticStep(previousTrace, nextTrace, previousStepIndex) {
  const previousStep = previousTrace?.steps[previousStepIndex];
  if (!previousStep || nextTrace.steps.length === 0) return 0;
  const previousFrame = previousStep.stack.at(-1);
  const candidates = [];
  for (let index = 0; index < nextTrace.steps.length; index++) {
    const frame = nextTrace.steps[index].stack.at(-1);
    if (frame.path === previousFrame.path &&
        frame.function_name === previousFrame.function_name &&
        frame.line_number === previousFrame.line_number) {
      candidates.push(index);
    }
  }
  if (candidates.length === 0) {
    return Math.min(previousStepIndex, nextTrace.steps.length - 1);
  }
  const relativePosition = previousStepIndex / Math.max(previousTrace.steps.length - 1, 1);
  const expected = relativePosition * Math.max(nextTrace.steps.length - 1, 1);
  return candidates.reduce((nearest, candidate) =>
    Math.abs(candidate - expected) < Math.abs(nearest - expected) ? candidate : nearest
  );
}
