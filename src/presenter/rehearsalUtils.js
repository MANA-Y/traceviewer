export function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function rehearsalSectionKey(section) {
  return section?.title?.trim() || 'Introduction';
}

export function targetStatus(elapsed, targetMinutes) {
  const target = Math.max(1, Number(targetMinutes) || 1) * 60_000;
  const remaining = target - elapsed;
  return {
    overrun: remaining < 0,
    label: remaining < 0
      ? `Over by ${formatDuration(-remaining)}`
      : `${formatDuration(remaining)} left`,
  };
}
