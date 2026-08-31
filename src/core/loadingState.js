export function isProducerUnreachable(diagnostic) {
  const message = String(diagnostic?.message ?? '');
  return /can't reach the live producer/i.test(message)
    || /live producer connection (failed|closed before opening)/i.test(message);
}

export function describeLoadingState({
  live = false,
  status = 'idle',
  hasTrace = false,
  hasCompiled = false,
  diagnostic = null,
} = {}) {
  if (live && !hasTrace && isProducerUnreachable(diagnostic)) {
    return {
      phase: 'stale',
      kicker: 'Live',
      title: "Can't reach the producer",
      detail: 'This page is not allowed to join the live session. Open the printed Audience or Presenter URL, or restart `traceviewer dev`.',
    };
  }

  if (live && !hasTrace) {
    if (status === 'connecting' || status === 'idle') {
      return {
        phase: 'connecting',
        kicker: 'Live',
        title: 'Connecting',
        detail: 'Joining the live session.',
      };
    }
    if (status === 'running') {
      return {
        phase: 'running',
        kicker: 'Live',
        title: 'Presentation is starting',
        detail: 'Steps are arriving from the speaker.',
      };
    }
    if (status === 'stale') {
      return {
        phase: 'stale',
        kicker: 'Live',
        title: 'Reconnecting',
        detail: 'The live session dropped. Trying again.',
      };
    }
    return {
      phase: 'waiting',
      kicker: 'Live',
      title: 'Waiting for the presenter',
      detail: 'You are connected. The talk will appear as soon as it starts.',
    };
  }

  if (status === 'compiling' || (hasTrace && !hasCompiled)) {
    return {
      phase: 'compiling',
      kicker: 'Preparing',
      title: 'Preparing presentation',
      detail: 'Compiling slides and playback steps.',
    };
  }

  if (hasTrace && hasCompiled) {
    return {
      phase: 'highlighting',
      kicker: 'Preparing',
      title: 'Almost ready',
      detail: 'Highlighting the first slide.',
    };
  }

  if (status === 'connecting') {
    return {
      phase: 'connecting',
      kicker: 'Live',
      title: 'Connecting',
      detail: 'Opening the presentation.',
    };
  }

  return {
    phase: 'loading',
    kicker: 'Opening',
    title: 'Loading presentation',
    detail: 'Opening the snapshot.',
  };
}

export function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
