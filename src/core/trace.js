const MAX_FILES = 10_000;
const MAX_STEPS = 1_000_000;
const MAX_STACK_DEPTH = 1_000;
const MAX_TOTAL_STACK_FRAMES = 2_000_000;
const MAX_TOTAL_RENDERINGS = 1_000_000;
const MAX_TOTAL_ENV_KEYS = 1_000_000;
const MAX_SOURCE_CHARACTERS = 100 * 1024 * 1024;
const MAX_TABLE_ENTRIES = 1_000_000;
const MAX_ERRORS = 20;
export const CURRENT_TRACE_FORMAT_VERSION = 2;

export class TraceValidationError extends Error {
  constructor(errors) {
    const suffix = errors.length === MAX_ERRORS ? " (additional errors omitted)" : "";
    super(`Invalid trace:\n${errors.join("\n")}${suffix}`);
    this.name = "TraceValidationError";
    this.errors = errors;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, message) {
  if (errors.length < MAX_ERRORS) {
    errors.push(message);
  }
}

function validateFrame(frame, path, files, fileLineCounts, errors, requireSource) {
  if (!isRecord(frame)) {
    addError(errors, `${path} must be an object`);
    return;
  }
  if (typeof frame.path !== "string" || frame.path.length === 0) {
    addError(errors, `${path}.path must be a non-empty string`);
  } else if (requireSource && !(frame.path in files)) {
    addError(errors, `${path}.path references a missing source file`);
  }
  if (!Number.isInteger(frame.line_number) || frame.line_number < 1) {
    addError(errors, `${path}.line_number must be a positive integer`);
  } else if (requireSource && fileLineCounts.has(frame.path) &&
             frame.line_number > fileLineCounts.get(frame.path)) {
    addError(errors, `${path}.line_number is outside the source file`);
  }
  if (typeof frame.function_name !== "string") {
    addError(errors, `${path}.function_name must be a string`);
  }
  if (frame.invocation_id != null &&
      !(typeof frame.invocation_id === "string" && frame.invocation_id.length > 0) &&
      !Number.isSafeInteger(frame.invocation_id)) {
    addError(errors, `${path}.invocation_id must be a safe integer, non-empty string, or null`);
  }
}

function validateRendering(rendering, path, errors) {
  if (!isRecord(rendering)) {
    addError(errors, `${path} must be an object`);
    return;
  }
  if (typeof rendering.type !== "string" || rendering.type.length === 0) {
    addError(errors, `${path}.type must be a non-empty string`);
  }
  if (rendering.style != null && !isRecord(rendering.style)) {
    addError(errors, `${path}.style must be an object or null`);
  }
  if (rendering.language != null && typeof rendering.language !== "string") {
    addError(errors, `${path}.language must be a string or null`);
  }
}

function validateTable(value, name, limit, errors) {
  if (!Array.isArray(value)) {
    addError(errors, `${name} must be an array`);
    return false;
  }
  if (value.length > limit) {
    addError(errors, `${name} must contain at most ${limit} entries`);
    return false;
  }
  return true;
}

function isIndex(value, table) {
  return Number.isInteger(value) && value >= 0 && value < table.length;
}

function derivePresentationSteps(steps, frames, renderings) {
  const visibleSteps = new Set();
  const presentationScopes = new Set();
  for (let index = 0; index < steps.length; index++) {
    const [stack, renderingsId] = steps[index];
    if (renderings[renderingsId].some((rendering) => rendering.type !== "notes")) {
      const frame = frames[stack[stack.length - 1]];
      visibleSteps.add(index);
      presentationScopes.add(JSON.stringify([frame.path, frame.function_name]));
    }
  }
  if (presentationScopes.size === 0) {
    return steps.map((_step, index) => index);
  }

  const result = [];
  const seenLocations = new Set();
  for (let index = 0; index < steps.length; index++) {
    const stack = steps[index][0];
    const frame = frames[stack[stack.length - 1]];
    const scope = JSON.stringify([frame.path, frame.function_name]);
    if (!presentationScopes.has(scope)) continue;
    const location = JSON.stringify([scope, frame.line_number]);
    if (!seenLocations.has(location) || visibleSteps.has(index)) {
      result.push(index);
    }
    seenLocations.add(location);
  }
  return result;
}

/**
 * Validate a format version 2 document and expand it into the playback shape.
 *
 * Version 2 stores unique frames, rendering lists, and output strings in
 * lookup tables; steps reference them by index. Expansion rebuilds one object
 * per step but shares the table entries by reference, so a trace with 127,681
 * recorded frames retains only the 652 distinct frame objects behind them.
 */
export function validateTrace(input) {
  const errors = [];

  if (!isRecord(input)) {
    throw new TraceValidationError(["trace must be an object"]);
  }
  if (input.formatVersion !== CURRENT_TRACE_FORMAT_VERSION) {
    throw new TraceValidationError([
      `formatVersion must be ${CURRENT_TRACE_FORMAT_VERSION}; received ${JSON.stringify(input.formatVersion)}`,
    ]);
  }

  if (!isRecord(input.files)) {
    addError(errors, "files must be an object");
  }
  if (!Array.isArray(input.steps)) {
    addError(errors, "steps must be an array");
  }
  const hasTables =
    validateTable(input.frames, "frames", MAX_TABLE_ENTRIES, errors) &&
    validateTable(input.renderings, "renderings", MAX_TABLE_ENTRIES, errors) &&
    validateTable(input.outputs, "outputs", MAX_TABLE_ENTRIES, errors);
  if (errors.length > 0 || !hasTables) {
    throw new TraceValidationError(errors);
  }

  const { files, frames, renderings, outputs, steps } = input;

  const fileEntries = Object.entries(files);
  const fileLineCounts = new Map();
  let sourceCharacters = 0;
  if (fileEntries.length === 0 || fileEntries.length > MAX_FILES) {
    addError(errors, `files must contain between 1 and ${MAX_FILES} entries`);
  }
  for (const [path, content] of fileEntries) {
    if (path.length === 0 || typeof content !== "string") {
      addError(errors, `files[${JSON.stringify(path)}] must be source text`);
    } else {
      sourceCharacters += content.length;
      fileLineCounts.set(path, content.split("\n").length);
    }
  }
  if (sourceCharacters > MAX_SOURCE_CHARACTERS) {
    addError(errors, `source text exceeds ${MAX_SOURCE_CHARACTERS} characters`);
  }

  if (steps.length === 0 || steps.length > MAX_STEPS) {
    addError(errors, `steps must contain between 1 and ${MAX_STEPS} entries`);
  }

  for (let index = 0; index < outputs.length && errors.length < MAX_ERRORS; index++) {
    if (typeof outputs[index] !== "string") {
      addError(errors, `outputs[${index}] must be a string`);
    }
  }

  let totalRenderings = 0;
  for (let index = 0; index < renderings.length && errors.length < MAX_ERRORS; index++) {
    const list = renderings[index];
    if (!Array.isArray(list)) {
      addError(errors, `renderings[${index}] must be an array`);
      continue;
    }
    totalRenderings += list.length;
    if (totalRenderings > MAX_TOTAL_RENDERINGS) {
      addError(errors, `trace exceeds ${MAX_TOTAL_RENDERINGS} renderings`);
      break;
    }
    for (let item = 0; item < list.length && errors.length < MAX_ERRORS; item++) {
      validateRendering(list[item], `renderings[${index}][${item}]`, errors);
    }
  }

  // A frame may be the active (innermost) frame in one step and a caller in
  // another. Source existence is only required where it is the active frame,
  // so collect those indexes before validating the frame table.
  const activeFrames = new Set();
  let totalStackFrames = 0;
  for (let stepIndex = 0; stepIndex < steps.length && errors.length < MAX_ERRORS; stepIndex++) {
    const step = steps[stepIndex];
    const stepPath = `steps[${stepIndex}]`;
    if (!Array.isArray(step) || step.length !== 5) {
      addError(errors, `${stepPath} must be a [frames, renderings, stdout, stderr, env] tuple`);
      continue;
    }
    const [stack, renderingsId, stdoutId, stderrId, env] = step;
    if (!Array.isArray(stack) || stack.length === 0 || stack.length > MAX_STACK_DEPTH) {
      addError(errors, `${stepPath}[0] must contain 1-${MAX_STACK_DEPTH} frame indexes`);
    } else {
      totalStackFrames += stack.length;
      if (totalStackFrames > MAX_TOTAL_STACK_FRAMES) {
        addError(errors, `trace exceeds ${MAX_TOTAL_STACK_FRAMES} total stack frames`);
        break;
      }
      let valid = true;
      for (let frameIndex = 0; frameIndex < stack.length; frameIndex++) {
        if (!isIndex(stack[frameIndex], frames)) {
          addError(errors, `${stepPath}[0][${frameIndex}] is not a valid frame index`);
          valid = false;
          break;
        }
      }
      if (valid) {
        activeFrames.add(stack[stack.length - 1]);
      }
    }
    if (!isIndex(renderingsId, renderings)) {
      addError(errors, `${stepPath}[1] is not a valid renderings index`);
    }
    if (!isIndex(stdoutId, outputs)) {
      addError(errors, `${stepPath}[2] is not a valid outputs index`);
    }
    if (!isIndex(stderrId, outputs)) {
      addError(errors, `${stepPath}[3] is not a valid outputs index`);
    }
    if (!isRecord(env)) {
      addError(errors, `${stepPath}[4] must be an object`);
    }
  }

  let totalEnvKeys = 0;
  for (const step of steps) {
    if (Array.isArray(step) && isRecord(step[4])) {
      totalEnvKeys += Object.keys(step[4]).length;
    }
  }
  if (totalEnvKeys > MAX_TOTAL_ENV_KEYS) {
    addError(errors, `trace exceeds ${MAX_TOTAL_ENV_KEYS} environment entries`);
  }

  let presentationSteps = input.presentationSteps;
  if (presentationSteps !== undefined) {
    if (!Array.isArray(presentationSteps) || presentationSteps.length === 0) {
      addError(errors, "presentationSteps must be a non-empty array");
    } else {
      let previous = -1;
      for (let index = 0; index < presentationSteps.length; index++) {
        const stepIndex = presentationSteps[index];
        if (!isIndex(stepIndex, steps)) {
          addError(errors, `presentationSteps[${index}] is not a valid step index`);
          break;
        }
        if (stepIndex <= previous) {
          addError(errors, "presentationSteps must be strictly increasing");
          break;
        }
        previous = stepIndex;
      }
    }
  }

  for (let index = 0; index < frames.length && errors.length < MAX_ERRORS; index++) {
    validateFrame(
      frames[index],
      `frames[${index}]`,
      files,
      fileLineCounts,
      errors,
      activeFrames.has(index),
    );
  }

  if (errors.length > 0) {
    throw new TraceValidationError(errors);
  }

  presentationSteps ??= derivePresentationSteps(steps, frames, renderings);

  return {
    formatVersion: CURRENT_TRACE_FORMAT_VERSION,
    files,
    presentationSteps,
    steps: steps.map(([stack, renderingsId, stdoutId, stderrId, env]) => ({
      stack: stack.map((index) => frames[index]),
      env,
      renderings: renderings[renderingsId],
      stdout: outputs[stdoutId],
      stderr: outputs[stderrId],
    })),
  };
}
