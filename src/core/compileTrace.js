import { getLast } from "../utils.js";
import { compilePlayback, getLocationId } from "./playback.js";

export function getLocation(path, lineNumber) {
  return JSON.stringify([path, lineNumber]);
}

function parseStructuredData(data) {
  if (typeof data !== "string") {
    return data;
  }
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function getNoteText(data) {
  const value = parseStructuredData(data);
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of ["message", "text", "content", "note"]) {
      if (typeof value[key] === "string") {
        return value[key];
      }
    }
  }
  if (data == null) {
    return "";
  }
  return typeof data === "string" ? data : JSON.stringify(data);
}

function getSectionData(data) {
  const value = parseStructuredData(data);
  if (typeof value === "string") {
    return { title: value, subtitle: null };
  }
  if (value && typeof value === "object") {
    return {
      title: typeof value.title === "string" ? value.title : "",
      subtitle: typeof value.subtitle === "string" ? value.subtitle : null,
    };
  }
  return { title: "", subtitle: null };
}

export function compileTrace(trace) {
  const sourceLines = new Map();
  for (const [path, content] of Object.entries(trace.files)) {
    sourceLines.set(path, content.split("\n"));
  }

  const playback = compilePlayback(trace);
  const presentationStepSet = new Set(playback.presentationSteps);
  const presentationLocations = new Set();
  const renderingsByLocation = new Map();
  const renderingHistoryByLocation = new Map();
  const firstRevealStep = new Map();
  const notesByStep = new Map();
  const notesByLocation = new Map();
  const sections = [];

  for (let stepIndex = 0; stepIndex < trace.steps.length; stepIndex++) {
    const step = trace.steps[stepIndex];
    const activeFrame = getLast(step.stack);
    const location = getLocation(activeFrame.path, activeFrame.line_number);
    const visibleRenderings = [];
    const notes = [];
    for (const rendering of step.renderings) {
      if (rendering.type === "notes") {
        notes.push(getNoteText(rendering.data));
        continue;
      }
      visibleRenderings.push(rendering);
      if (rendering.type === "section") {
        sections.push({
          stepIndex,
          ...getSectionData(rendering.data),
          location,
        });
      }
    }
    if (notes.length > 0) {
      notesByStep.set(stepIndex, notes);
      notesByLocation.set(location, notes);
    }
    if (visibleRenderings.length > 0) {
      renderingsByLocation.set(location, visibleRenderings);
      const history = renderingHistoryByLocation.get(location) ?? [];
      history.push({ stepIndex, renderings: visibleRenderings });
      renderingHistoryByLocation.set(location, history);
    }

    if (presentationStepSet.has(stepIndex)) {
      const lines = sourceLines.get(activeFrame.path);
      let lineNumber = activeFrame.line_number;
      presentationLocations.add(getLocation(activeFrame.path, lineNumber));
      while (lineNumber > 0 && lines?.[lineNumber - 1] !== undefined) {
        const revealLocation = getLocation(activeFrame.path, lineNumber);
        if (!firstRevealStep.has(revealLocation)) {
          firstRevealStep.set(revealLocation, stepIndex);
        }
        const line = lines[lineNumber - 1];
        if (/^\S/.test(line)) {
          break;
        }
        lineNumber--;
      }
    }
  }

  const lineDescriptorsByPath = new Map();
  const presentationLinesByPath = new Map();
  for (const [path, lines] of sourceLines) {
    let presentationLineNumber = 1;
    const descriptors = lines.map((_line, index) => {
      const lineNumber = index + 1;
      const location = getLocation(path, lineNumber);
      const descriptor = {
        lineNumber,
        location,
        hasRendering: renderingHistoryByLocation.has(location),
        isRecorded: playback.stepsByLocation.has(getLocationId(path, lineNumber)),
        isPresentation: presentationLocations.has(location),
        presentationLineNumber: null,
      };
      if (descriptor.hasRendering || descriptor.isPresentation) {
        descriptor.presentationLineNumber = presentationLineNumber++;
      }
      return descriptor;
    });
    lineDescriptorsByPath.set(path, descriptors);
    const presentationLines = descriptors.filter((descriptor) => descriptor.presentationLineNumber !== null);
    let sectionGroupId = 0;
    let sectionTitle = null;
    for (const descriptor of presentationLines) {
      const renderings = renderingsByLocation.get(descriptor.location) ?? [];
      const sectionRendering = renderings.find((rendering) => rendering.type === "section");
      if (sectionRendering) {
        sectionGroupId += 1;
        sectionTitle = getSectionData(sectionRendering.data).title || null;
      }
      descriptor.sectionGroupId = sectionGroupId;
      descriptor.sectionTitle = sectionTitle;
    }
    presentationLinesByPath.set(path, presentationLines);
  }

  return {
    firstRevealStep,
    lineDescriptorsByPath,
    notesByLocation,
    notesByStep,
    playback,
    presentationLinesByPath,
    renderingsByLocation,
    renderingHistoryByLocation,
    sections,
    sourceLines,
  };
}

export function getRenderingsAtStep(compiledTrace, location, stepIndex) {
  const history = compiledTrace.renderingHistoryByLocation.get(location) ?? [];
  let low = 0;
  let high = history.length - 1;
  let match = null;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = history[middle];
    if (candidate.stepIndex <= stepIndex) {
      match = candidate.renderings;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match;
}

export function groupPresentationLines(descriptors) {
  const groups = [];
  for (const descriptor of descriptors) {
    const id = descriptor.sectionGroupId ?? 0;
    const last = groups.at(-1);
    if (!last || last.id !== id) {
      groups.push({
        id,
        title: descriptor.sectionTitle ?? null,
        items: [descriptor],
      });
    } else {
      last.items.push(descriptor);
    }
  }
  return groups;
}
