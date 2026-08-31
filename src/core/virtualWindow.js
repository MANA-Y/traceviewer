export function getVirtualRange({
  itemCount,
  itemHeight,
  scrollTop,
  viewportHeight,
  overscan = 12,
}) {
  if (itemCount <= 0) return { start: 0, end: 0 };
  const visibleStart = Math.floor(Math.max(0, scrollTop) / itemHeight);
  const visibleEnd = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / itemHeight);
  return {
    start: Math.max(0, visibleStart - overscan),
    end: Math.min(itemCount, visibleEnd + overscan),
  };
}
