import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom';
import { getLast } from './utils';
import ErrorBoundary from './ErrorBoundary';
import { getRenderingsAtStep, groupPresentationLines } from './core/compileTrace';
import { alignCurrentPresentationLine } from './core/presentationScroll';
import { compileTraceAsync } from './core/traceCompiler';
import { findLocationStep, mapSemanticStep, materializeEnvironment, snapToPresentationStep, transition } from './core/playback';
import { clampStepIndex, openNotesWindow, parseViewerQuery } from './core/urlState';
import { highlightSourceFiles } from './rendering/languages';
import { Rendering } from './rendering/renderers';
import { LiveTraceSource, SnapshotTraceSource } from './sources/traceSource';
import LoadingScreen from './LoadingScreen';
import OpenTracePicker from './OpenTracePicker';
import NotesConsole from './presenter/NotesConsole';
import PresenterShell from './presenter/PresenterShell';
import SettingsDialog from './presenter/SettingsDialog';
import Timeline from './presenter/Timeline';
import FontControl from './FontControl';
import ThemeControl from './ThemeControl';
import VirtualizedSource from './VirtualizedSource';
import { BUNDLED_EXAMPLE_TRACE, displayNameForTrace, loadStepComment, resolveSnapshotUrl } from './openTrace';
import { resolvePublicAssetUrl } from './publicUrl';
import { exportPresentationPdf } from './exportPdf';
import PrintSpeakerNotes from './presenter/PrintSpeakerNotes';

function TraceViewer() {
  const {
    tracePath: requestedTracePath,
    liveUrl,
    liveToken,
    targetSourcePath,
    targetLineNumber,
    targetStepIndex,
    rawMode,
    notesMode,
    animateMode,
    presenterMode,
    viewerRole,
  } = parseViewerQuery(window.location.search);
  const liveAudience = Boolean(liveUrl) && viewerRole === 'audience';
  const canControlLive = Boolean(liveUrl) && viewerRole === 'presenter';
  const tracePath = requestedTracePath ?? document.querySelector(
    'meta[name="traceviewer-default-trace"]',
  )?.getAttribute('content') ?? null;
  const snapshotUrl = resolveSnapshotUrl(tracePath);
  const navigate = useNavigate();

  const [error, setError] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);
  const [sourceStatus, setSourceStatus] = useState('idle');
  const [trace, setTrace] = useState(null);
  const [compiledTrace, setCompiledTrace] = useState(null);
  const [highlightedSources, setHighlightedSources] = useState(null);
  const [overlay, setOverlay] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [audienceUrl, setAudienceUrl] = useState(null);
  const [notesUrl, setNotesUrl] = useState(null);
  const traceRef = useRef(null);
  const currentStepIndexRef = useRef(null);
  const sourceRef = useRef(null);
  const pdfExportLock = useRef(false);

  useEffect(() => {
    if (!liveUrl && !snapshotUrl) {
      setTrace(null);
      setError(null);
      setSourceStatus('idle');
      return;
    }

    let source;
    try {
      if (liveUrl && !liveToken) {
        throw new Error('A live producer requires a session token');
      }
      source = liveUrl ? new LiveTraceSource(liveUrl, liveToken) : new SnapshotTraceSource(snapshotUrl);
    } catch (sourceError) {
      setError(sourceError);
      return;
    }

    setError(null);
    setDiagnostic(null);
    setAudienceUrl(null);
    setNotesUrl(null);
    setTrace(null);
    setCompiledTrace(null);
    setHighlightedSources(null);
    sourceRef.current = source;
    let compileGeneration = 0;
    const unsubscribe = source.subscribe((event) => {
      if (event.type === 'snapshot') {
        const generation = ++compileGeneration;
        setSourceStatus('compiling');
        compileTraceAsync(event.trace).then(({ trace: validatedTrace, compiledTrace: compiled }) => {
          if (generation !== compileGeneration) return;
          const mappedStep = liveUrl && traceRef.current && currentStepIndexRef.current !== null
            ? mapSemanticStep(traceRef.current, validatedTrace, currentStepIndexRef.current)
            : null;
          setTrace(validatedTrace);
          setCompiledTrace(compiled);
          setError(null);
          if (mappedStep !== null && mappedStep !== currentStepIndexRef.current) {
            updateUrlParams({ step: mappedStep, source: null, line: null }, navigate);
          }
          setDiagnostic(null);
          document.title = liveUrl
            ? 'Trace - live presentation'
            : `Trace - ${displayNameForTrace(tracePath, new URLSearchParams(window.location.search).get('name'))}`;
        }).catch((compileError) => {
          if (generation !== compileGeneration) return;
          setError(compileError);
        });
      } else if (event.type === 'session') {
        setAudienceUrl(event.audienceUrl ?? null);
        setNotesUrl(event.notesUrl ?? null);
      } else if (event.type === 'status') {
        setSourceStatus(event.status);
        if (event.status === 'connected' || event.status === 'complete') setError(null);
      } else if (event.type === 'diagnostic') {
        setDiagnostic(event.diagnostic);
      } else if (event.type === 'presentation_state') {
        if (event.stepIndex !== currentStepIndexRef.current) {
          updateUrlParams({ step: event.stepIndex, source: null, line: null }, navigate);
        }
      } else if (event.type === 'error') {
        setError(event.error);
      }
    });
    source.connect().catch((sourceError) => {
      if (sourceError.name !== 'AbortError') {
        console.error(sourceError);
        if (liveUrl) {
          setDiagnostic({ message: sourceError.message });
        } else {
          setError(sourceError);
        }
      }
    });
    return () => {
      compileGeneration++;
      unsubscribe();
      if (sourceRef.current === source) sourceRef.current = null;
      source.close();
    };
  }, [tracePath, snapshotUrl, liveUrl, liveToken, viewerRole, navigate]);

  useEffect(() => {
    if (!trace) return;
    document.title = notesMode
      ? 'Trace - presenter notes'
      : liveUrl
        ? 'Trace - live presentation'
        : `Trace - ${displayNameForTrace(tracePath, new URLSearchParams(window.location.search).get('name'))}`;
  }, [trace, notesMode, liveUrl, tracePath]);

  useEffect(() => {
    if (!trace) return undefined;
    let cancelled = false;
    setHighlightedSources(null);
    highlightSourceFiles(trace.files).then((sources) => {
      if (!cancelled) setHighlightedSources(sources);
    }).catch((highlightError) => {
      if (!cancelled) setError(highlightError);
    });
    return () => { cancelled = true; };
  }, [trace]);

  const currentLocation = useMemo(() => resolveCurrentLocation({
    trace,
    playback: compiledTrace?.playback,
    targetSourcePath,
    targetLineNumber,
    targetStepIndex,
    rawMode,
  }), [trace, compiledTrace, targetSourcePath, targetLineNumber, targetStepIndex, rawMode]);
  const currentStepIndex = currentLocation?.stepIndex ?? null;

  useEffect(() => {
    if (rawMode || currentStepIndex === null || targetStepIndex === null) {
      return;
    }
    if (currentStepIndex !== targetStepIndex) {
      updateUrlParams({ step: currentStepIndex, source: null, line: null }, navigate);
    }
  }, [rawMode, currentStepIndex, targetStepIndex, navigate]);

  useEffect(() => {
    traceRef.current = trace;
    currentStepIndexRef.current = currentStepIndex;
  }, [trace, currentStepIndex]);

  const seekTo = (stepIndex) => {
    updateUrlParams({ step: stepIndex, source: null, line: null }, navigate);
    if (canControlLive) {
      sourceRef.current?.setStep(stepIndex);
    }
  };

  const startPdfExport = () => {
    if (notesMode || rawMode || exportingPdf) return;
    setOverlay(null);
    setExportingPdf(true);
  };

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('is-print-export', exportingPdf);
  }, [exportingPdf]);

  useEffect(() => {
    if (!exportingPdf || pdfExportLock.current) return undefined;
    pdfExportLock.current = true;
    exportPresentationPdf({ manageClass: false }).finally(() => {
      pdfExportLock.current = false;
      setExportingPdf(false);
    });
    return undefined;
  }, [exportingPdf]);

  useLayoutEffect(() => {
    if (!trace || currentStepIndex === null) {
      return;
    }

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const isEditing = event.target instanceof Element &&
        event.target.closest('input, textarea, select, [contenteditable="true"]');
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      if (isEditing && key !== 'escape') {
        return;
      }

      if (key === '?' || key === 's' || key === 'escape') {
        setOverlay((visible) => {
          if (key === 'escape') return null;
          const next = key === '?' ? 'help' : 'settings';
          return visible === next ? null : next;
        });
      } else if (liveAudience) {
        return;
      } else if (key === 'n' && !notesMode) {
        if (notesUrl) window.open(notesUrl, 'traceviewer-notes');
        else openNotesWindow();
      } else if (!event.shiftKey && (key === 'arrowright' || key === 'l')) {
        runPlaybackCommand({
          playback: compiledTrace.playback,
          currentStepIndex,
          command: rawMode ? 'next' : 'presentationNext',
          seekTo,
        });
      } else if (!event.shiftKey && (key === 'arrowleft' || key === 'h')) {
        runPlaybackCommand({
          playback: compiledTrace.playback,
          currentStepIndex,
          command: rawMode ? 'previous' : 'presentationPrevious',
          seekTo,
        });
      } else if ((event.shiftKey && key === 'arrowright') || key === 'j') {
        runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'stepOverNext', seekTo});
      } else if ((event.shiftKey && key === 'arrowleft') || key === 'k') {
        runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'stepOverPrevious', seekTo});
      } else if (key === 'u') {
        runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'stepOut', seekTo});
      } else if (key === 'r') {
        if (notesMode) return;
        toggleRawMode({rawMode, navigate});
      } else if (key === 'a') {
        toggleAnimateMode({animateMode, navigate});
      } else if (key === 'p') {
        if (notesMode) {
          updateUrlParams({ view: null, presenter: '1' }, navigate);
        } else {
          togglePresenterMode({presenterMode, navigate});
        }
      } else if (key === 'g') {
        setOverlay((visible) => visible === 'open' ? null : 'open');
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [trace, compiledTrace, currentStepIndex, tracePath, rawMode, notesMode, liveAudience, canControlLive, notesUrl, animateMode, presenterMode, navigate]);

  if (!tracePath && !liveUrl) {
    return <LandingScreen navigate={navigate} />;
  }
  if (!liveUrl && !snapshotUrl) {
    return (
      <StatusScreen title="Choose the snapshot file again">
        <p>A local file is not kept after reload. Pick the JSON snapshot once more.</p>
        <OpenTracePicker navigate={navigate} />
      </StatusScreen>
    );
  }
  if (error) {
    return (
      <StatusScreen title="Could not open presentation" error={error}>
        <OpenTracePicker navigate={navigate} />
      </StatusScreen>
    );
  }
  if (!trace || !compiledTrace || !currentLocation || (!notesMode && !highlightedSources)) {
    return (
      <LoadingScreen
        live={Boolean(liveUrl)}
        status={sourceStatus}
        hasTrace={Boolean(trace)}
        hasCompiled={Boolean(compiledTrace)}
        diagnostic={diagnostic}
      />
    );
  }

  const { path: currentPath, lineNumber: currentLineNumber } = currentLocation;
  const nextPresentationStep = compiledTrace.playback.presentationNext[currentStepIndex];
  const currentEnvironment = currentStepIndex >= 0
    ? materializeEnvironment(compiledTrace.playback.environments[currentStepIndex])
    : {};
  const renderedLines = notesMode ? null : renderLines({
    trace,
    compiledTrace,
    highlightedSources,
    currentPath,
    currentLineNumber,
    currentStepIndex,
    rawMode,
    animateMode,
    sections: compiledTrace.sections ?? [],
    navigate,
    onHelp: () => setOverlay('help'),
    onSettings: () => setOverlay('settings'),
    onExportPdf: startPdfExport,
    exportingPdf,
    presentationId: tracePath ?? liveUrl ?? 'presentation',
    canSeek: !liveAudience,
    onSeek: seekTo,
  });

  return (
    <div className="trace-viewer-container">
      {diagnostic && <aside className="live-diagnostic" role="status">{diagnostic.message ?? 'Producer diagnostic'}</aside>}
      {overlay === 'help' && <ShortcutHelp onClose={() => setOverlay(null)} />}
      {overlay === 'open' && <OpenTraceDialog navigate={navigate} onClose={() => setOverlay(null)} />}
      {overlay === 'settings' && <SettingsDialog
        animateMode={animateMode}
        presenterMode={presenterMode}
        rawMode={rawMode}
        notesMode={notesMode}
        canOpenNotes={!notesMode && !liveAudience}
        notesUrl={notesUrl}
        onToggleAnimate={() => toggleAnimateMode({animateMode, navigate})}
        onTogglePresenter={() => togglePresenterMode({presenterMode, navigate})}
        onToggleRaw={() => toggleRawMode({rawMode, navigate})}
        onOpenNotes={() => notesUrl ? window.open(notesUrl, 'traceviewer-notes') : openNotesWindow()}
        onShowSlides={() => updateUrlParams({ view: null, presenter: '1' }, navigate)}
        onExportPdf={notesMode || rawMode ? undefined : startPdfExport}
        onClose={() => setOverlay(null)}
      />}
      {notesMode ? (
        <NotesConsole
          currentStepIndex={currentStepIndex}
          notes={compiledTrace.notesByStep?.get(currentStepIndex)}
          nextNotes={nextPresentationStep >= 0
            ? compiledTrace.notesByStep?.get(nextPresentationStep)
            : null}
          environment={currentEnvironment}
          step={trace.steps[currentStepIndex]}
          steps={trace.steps}
          presentationId={tracePath ?? liveUrl ?? 'presentation'}
          live={Boolean(liveUrl)}
          audienceUrl={audienceUrl}
          canControl={!liveUrl || canControlLive}
          sections={compiledTrace.sections ?? []}
          totalSteps={trace.steps.length}
          stepIndices={compiledTrace.playback.presentationSteps}
          onSeek={seekTo}
          onPrevious={() => runPlaybackCommand({
            playback: compiledTrace.playback,
            currentStepIndex,
            command: 'presentationPrevious',
            seekTo,
          })}
          onNext={() => runPlaybackCommand({
            playback: compiledTrace.playback,
            currentStepIndex,
            command: 'presentationNext',
            seekTo,
          })}
          onHelp={() => setOverlay('help')}
          onSettings={() => setOverlay('settings')}
        />
      ) : (
        <>
      <div className={`lines-panel${presenterMode ? ' presenter-active' : ''}`}>{renderedLines}</div>
      {presenterMode && <PresenterShell
        currentStepIndex={currentStepIndex}
        notes={compiledTrace.notesByStep?.get(currentStepIndex)}
        nextNotes={nextPresentationStep >= 0
          ? compiledTrace.notesByStep?.get(nextPresentationStep)
          : null}
        environment={currentEnvironment}
        step={trace.steps[currentStepIndex]}
        steps={trace.steps}
        presentationId={tracePath ?? liveUrl ?? 'presentation'}
      />}
        </>
      )}
    </div>
  );
}

function ShortcutHelp({ onClose }) {
  const shortcuts = [
    ['→ / L', 'Next step'],
    ['← / H', 'Previous step'],
    ['J / Shift + →', 'Step over forward'],
    ['K / Shift + ←', 'Step over backward'],
    ['U', 'Step out'],
    ['A', 'Toggle progressive reveal'],
    ['R', 'Toggle source/rendered view'],
    ['P', 'Toggle presenter view'],
    ['N', 'Open notes and control window'],
    ['G', 'Open another presentation'],
    ['S', 'Open presentation settings'],
    ['? / Esc', 'Open or close this help'],
  ];
  return (
    <div className="shortcut-help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="shortcut-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="shortcut-help-title">Keyboard shortcuts</h2>
          <button type="button" aria-label="Close shortcuts" onClick={onClose}>×</button>
        </header>
        <dl>
          {shortcuts.map(([keys, action]) => (
            <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}

const LANDING_EXAMPLES = [
  ["Minimal example", BUNDLED_EXAMPLE_TRACE],
];

function LandingScreen({ navigate }) {
  const [examples, setExamples] = useState([]);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      LANDING_EXAMPLES.map(async (entry) => {
        try {
          const response = await fetch(resolvePublicAssetUrl(entry[1]), { method: 'HEAD' });
          return response.ok ? entry : null;
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (!cancelled) setExamples(rows.filter(Boolean));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="landing-screen">
      <div className="landing-chrome">
        <FontControl />
        <ThemeControl />
      </div>
      <div className="landing-inner">
        <header className="landing-header">
          <h1>Open a presentation</h1>
          <p>
            {examples.length > 0
              ? 'Choose an included talk, a local snapshot file, or a served URL.'
              : 'Open a local snapshot file, paste a served URL, or use the viewer query printed by the producer.'}
          </p>
        </header>
        {examples.length > 0 && (
          <section className="landing-section" aria-label="Included talks">
            <h2>Included</h2>
            <div className="presentation-list">
              {examples.map(([title, trace]) => (
                <button key={trace} type="button" onClick={() => navigate(`?trace=${encodeURIComponent(trace)}&animate=1`)}>
                  <strong>{title}</strong>
                  <small>{trace}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        <OpenTracePicker navigate={navigate} />
        <p className="landing-hint">Share the Presenter URL screen. Open notes with <kbd>N</kbd> or the Notes URL on a phone.</p>
      </div>
    </main>
  );
}

function OpenTraceDialog({ navigate, onClose }) {
  return (
    <div className="shortcut-help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="shortcut-help-dialog open-trace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-trace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="open-trace-title">Open a presentation</h2>
          <button type="button" aria-label="Close open dialog" onClick={onClose}>×</button>
        </header>
        <OpenTracePicker navigate={navigate} onOpened={onClose} />
      </section>
    </div>
  );
}

function StatusScreen({ title, error, children }) {
  return (
    <main className="status-screen" role={error ? 'alert' : 'status'}>
      <h1>{title}</h1>
      {error && <pre>{error.message}</pre>}
      {children}
    </main>
  );
}

function resolveCurrentLocation({
  trace,
  playback,
  targetSourcePath,
  targetLineNumber,
  targetStepIndex,
  rawMode,
}) {
  if (!trace || !playback) {
    return null;
  }

  if (targetStepIndex !== null || targetLineNumber === null || !trace.files[targetSourcePath]) {
    let stepIndex = clampStepIndex(targetStepIndex, trace.steps.length);
    if (!rawMode) {
      stepIndex = targetStepIndex === null
        ? playback.presentationSteps[0]
        : snapToPresentationStep(playback, stepIndex);
    }
    const activeFrame = getLast(trace.steps[stepIndex].stack);
    return { stepIndex, path: activeFrame.path, lineNumber: activeFrame.line_number };
  }

  const stepIndex = findLocationStep(playback, targetSourcePath, targetLineNumber, -1, 1);
  return { stepIndex, path: targetSourcePath, lineNumber: targetLineNumber };
}

function runPlaybackCommand({playback, currentStepIndex, command, seekTo}) {
  const newStepIndex = transition(playback, currentStepIndex, command);
  if (newStepIndex !== null && newStepIndex !== currentStepIndex) {
    seekTo(newStepIndex);
  }
}

function toggleRawMode({rawMode, navigate}) {
  const newRawMode = !rawMode;
  updateUrlParams({ view: newRawMode ? "source" : null, raw: null }, navigate);
}

function toggleAnimateMode({animateMode, navigate}) {
  const newAnimateMode = !animateMode;
  updateUrlParams({ animate: newAnimateMode ? "1" : "0" }, navigate);
}

function togglePresenterMode({presenterMode, navigate}) {
  updateUrlParams({ presenter: presenterMode ? "0" : "1" }, navigate);
}

function renderLines({
  trace,
  compiledTrace,
  highlightedSources,
  currentPath,
  currentLineNumber,
  currentStepIndex,
  rawMode,
  animateMode,
  sections,
  navigate,
  onHelp,
  onSettings,
  onExportPdf,
  exportingPdf = false,
  presentationId,
  canSeek = true,
  onSeek,
}) {
  const lines = highlightedSources.get(currentPath) ?? [];
  const lineDescriptors = rawMode
    ? compiledTrace.lineDescriptorsByPath.get(currentPath) ?? []
    : compiledTrace.presentationLinesByPath.get(currentPath) ?? [];
  // Render the lines.  For each line:
  // - render the line number
  // - render either the renderings (if they exist) or the line
  const renderDescriptor = (descriptor, options) => {
    const { lineNumber, location } = descriptor;
    const line = lines[lineNumber - 1] ?? '';
    const renderStepIndex = exportingPdf ? trace.steps.length - 1 : currentStepIndex;
    const renderings = getRenderingsAtStep(compiledTrace, location, renderStepIndex ?? -1);
    const locationNotes = exportingPdf ? compiledTrace.notesByLocation?.get(location) : null;
    const locationComment = exportingPdf && presentationId
      ? loadLocationComment(presentationId, compiledTrace, location)
      : '';
    const renderedItems = [];
    if (!rawMode && renderings && renderings.length > 0) {
      const renderedRenderings = renderings.map((rendering, index) => {
        const renderingType = typeof rendering.type === 'string'
          ? rendering.type.replace(/[^a-z0-9-]/gi, '').toLowerCase()
          : 'unknown';
        return (
          <ErrorBoundary key={index} fallback={<span className="renderer-error">[rendering unavailable]</span>}>
            <div className={`rendering rendering-${renderingType}`}>
              <Rendering
                rendering={rendering}
                printExport={exportingPdf}
                onInternalLink={(link) => {
                  updateUrlParams({ source: link.path, line: link.line_number, step: null }, navigate);
                }}
              />
            </div>
          </ErrorBoundary>
        );
      });
      renderedItems.push(<div key="renderings" className="renderings">{renderedRenderings}</div>);
    } else if (!(exportingPdf && (locationNotes || locationComment))) {
      renderedItems.push(<span key="code" className="code-container" dangerouslySetInnerHTML={{ __html: line }} />);
    }
    if (exportingPdf && (locationNotes || locationComment)) {
      renderedItems.push(
        <PrintSpeakerNotes key="print-notes" notes={locationNotes} comment={locationComment} />,
      );
    }

    const lineNumberSpan = (
      <span
        key={0}
        className="line-number code-container"
        onClick={() => gotoLine({playback: compiledTrace.playback, currentPath, currentLineNumber, currentStepIndex, lineNumber, navigate})}
      >
        {rawMode ? lineNumber : descriptor.presentationLineNumber}
      </span>
    );

    const renderedItemsSpan = (
      <div className="line-content">{renderedItems}</div>
    );

    const lineClass = ["line"];
    const isCurrentLine = lineNumber === currentLineNumber;
    if (isCurrentLine) {
      lineClass.push("current-line");
    }
    if (options?.isHeading) {
      lineClass.push("section-heading");
    }
    const revealStep = compiledTrace.firstRevealStep.get(location);
    if (!exportingPdf && currentStepIndex !== null && animateMode && !rawMode &&
        (revealStep === undefined || revealStep > currentStepIndex)) {
      lineClass.push("cloaked");
    }

    return isCurrentLine
      ? <CurrentLine key={lineNumber} className={lineClass.join(" ")} sectionId={options?.sectionId}>{lineNumberSpan}{renderedItemsSpan}</CurrentLine>
      : <div key={lineNumber} className={lineClass.join(" ")}>{lineNumberSpan}{renderedItemsSpan}</div>;
  };
  const activeIndex = lineDescriptors.findIndex(({ lineNumber }) => lineNumber === currentLineNumber);
  const sectionGroups = rawMode ? [] : groupPresentationLines(lineDescriptors);
  const currentSectionId = exportingPdf
    ? lineDescriptors.at(-1)?.sectionGroupId ?? 0
    : lineDescriptors[activeIndex]?.sectionGroupId ?? 0;
  const renderedLines = rawMode
    ? <VirtualizedSource items={lineDescriptors} activeIndex={activeIndex} renderItem={renderDescriptor} />
    : <div className="presentation-sections">
      {sectionGroups.map((group) => {
        const isCurrent = group.id === currentSectionId;
        const headingLine = group.items[0];
        const stateClass = isCurrent ? 'is-current' : (group.id < currentSectionId ? 'is-past' : 'is-future');
        const hasHeading = group.id > 0 && group.title !== null;
        return (
          <section
            key={group.id}
            className={`presentation-section ${stateClass}`}
            data-section-id={group.id}
            aria-label={group.title || undefined}
          >
            {group.items.map((descriptor) => renderDescriptor(descriptor, {
              sectionId: group.id,
              isHeading: hasHeading && descriptor.lineNumber === headingLine.lineNumber,
            }))}
          </section>
        );
      })}
    </div>;

  const animateIcon = animateMode ? "⛅️" : "☀️";
  const rawIcon = rawMode ? "⚙️" : "⚪️";
  const stepBackwardIcon = "⬅️";
  const stepForwardIcon = "➡️";
  const stepOverBackwardIcon = "↖️";
  const stepOverForwardIcon = "↗️";
  const stepUpIcon = "⤴️";
  const buttons = (
    <span className="icon-buttons">
      <button type="button" aria-label="Toggle animation" title="Toggle animation [A]" onClick={() => toggleAnimateMode({animateMode, navigate})}>{animateIcon}</button>
      <button type="button" aria-label="Toggle source view" title="Toggle source view [R]" onClick={() => toggleRawMode({rawMode, navigate})}>{rawIcon}</button>
      <button type="button" aria-label="Previous step" title="Previous step [h or left]" disabled={currentStepIndex <= 0} onClick={() => runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'previous', seekTo: onSeek})}>{stepBackwardIcon}</button>
      <button type="button" aria-label="Next step" title="Next step [l or right]" disabled={currentStepIndex >= trace.steps.length - 1} onClick={() => runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'next', seekTo: onSeek})}>{stepForwardIcon}</button>
      <button type="button" aria-label="Step over backward" title="Step over backward [k or shift-left]" onClick={() => runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'stepOverPrevious', seekTo: onSeek})}>{stepOverBackwardIcon}</button>
      <button type="button" aria-label="Step over forward" title="Step over forward [j or shift-right]" onClick={() => runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'stepOverNext', seekTo: onSeek})}>{stepOverForwardIcon}</button>
      <button type="button" aria-label="Step out" title="Step out [u]" onClick={() => runPlaybackCommand({playback: compiledTrace.playback, currentStepIndex, command: 'stepOut', seekTo: onSeek})}>{stepUpIcon}</button>
    </span>
  )

  const header = rawMode ? (
    <div className="header">
      <div className="header-title">
        <span>{currentPath}</span>
        {buttons}
      </div>
    </div>
  ) : null;

  return (
    <div className={rawMode ? 'source-mode' : 'presentation-mode'}>
      {header}
      <div>
        {renderedLines}
      </div>
      <Timeline
        currentStepIndex={currentStepIndex}
        totalSteps={trace.steps.length}
        stepIndices={rawMode ? null : compiledTrace.playback.presentationSteps}
        sections={sections}
        onSeek={canSeek ? onSeek : undefined}
        onHelp={onHelp}
        onSettings={onSettings}
        onExportPdf={rawMode ? undefined : onExportPdf}
      />
    </div>
  );
}

function loadLocationComment(presentationId, compiledTrace, location) {
  const history = compiledTrace.renderingHistoryByLocation.get(location) ?? [];
  const stepIndexes = [
    ...history.map((entry) => entry.stepIndex).reverse(),
    compiledTrace.firstRevealStep.get(location),
  ];
  const seen = new Set();
  for (const stepIndex of stepIndexes) {
    if (!Number.isInteger(stepIndex) || seen.has(stepIndex)) continue;
    seen.add(stepIndex);
    const comment = loadStepComment(presentationId, stepIndex);
    if (comment.trim()) return comment;
  }
  return '';
}

function gotoLine({playback, currentPath, currentLineNumber, currentStepIndex, lineNumber, navigate}) {
  const direction = currentLineNumber <= lineNumber ? 1 : -1;
  const stepIndex = findLocationStep(playback, currentPath, lineNumber, currentStepIndex, direction);
  if (stepIndex !== null) {
    updateUrlParams({ source: null, line: null, step: stepIndex }, navigate);
    return;
  }
  updateUrlParams({ source: currentPath, line: lineNumber, step: null }, navigate);
}

function CurrentLine({ className, children, sectionId }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (document.documentElement.classList.contains('is-print-export')) {
      return undefined;
    }

    const align = () => alignCurrentPresentationLine(el);
    const frame = requestAnimationFrame(align);

    const images = [...el.querySelectorAll('img')];
    for (const img of images) {
      if (!img.complete) img.addEventListener('load', align, { once: true });
    }

    return () => {
      cancelAnimationFrame(frame);
      for (const img of images) img.removeEventListener('load', align);
    };
  }, [sectionId, className]);

  return <div ref={ref} className={className}>{children}</div>;
}

function updateUrlParams(params, navigate) {
  const urlParams = new URLSearchParams(window.location.search);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null) {
      urlParams.delete(key);
    } else {
      urlParams.set(key, value);
    }
  });
  navigate(`?${urlParams.toString()}`, { preventScrollReset: true });
}

export default TraceViewer;
