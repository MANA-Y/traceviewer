import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getVirtualRange } from './core/virtualWindow';

const ITEM_HEIGHT = 24;
const VIRTUALIZATION_THRESHOLD = 400;

export default function VirtualizedSource({ items, activeIndex, renderItem }) {
  const viewportRef = useRef(null);
  const [viewport, setViewport] = useState({ height: window.innerHeight, scrollTop: 0 });
  const virtualized = items.length > VIRTUALIZATION_THRESHOLD;

  useLayoutEffect(() => {
    if (!virtualized) return undefined;
    const element = viewportRef.current;
    const update = () => setViewport({ height: element.clientHeight, scrollTop: element.scrollTop });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
    };
  }, [virtualized, items]);

  useEffect(() => {
    if (!virtualized || activeIndex < 0) return;
    const element = viewportRef.current;
    const top = activeIndex * ITEM_HEIGHT;
    const bottom = top + ITEM_HEIGHT;
    if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) {
      element.scrollTo({ top: Math.max(0, top - element.clientHeight / 2), behavior: 'auto' });
    }
  }, [activeIndex, virtualized, items]);

  if (!virtualized) return items.map(renderItem);

  const { start, end } = getVirtualRange({
    itemCount: items.length,
    itemHeight: ITEM_HEIGHT,
    scrollTop: viewport.scrollTop,
    viewportHeight: viewport.height,
  });
  return (
    <div ref={viewportRef} className="virtual-source-viewport" data-rendered-lines={end - start}>
      <div className="virtual-source-canvas" style={{ height: items.length * ITEM_HEIGHT }}>
        {items.slice(start, end).map((item, offset) => (
          <div
            key={item.lineNumber}
            className="virtual-source-row"
            style={{ transform: `translateY(${(start + offset) * ITEM_HEIGHT}px)` }}
          >
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}
