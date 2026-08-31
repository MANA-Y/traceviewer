import { useLayoutEffect, useState } from 'react';

export function usePrintLayout() {
  const [printing, setPrinting] = useState(false);

  useLayoutEffect(() => {
    const media = globalThis.matchMedia?.('print');
    const root = document.documentElement;
    const sync = () => {
      const next = Boolean(media?.matches) || root.classList.contains('is-print-export');
      setPrinting((current) => (current === next ? current : next));
    };
    media?.addEventListener('change', sync);
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    sync();
    return () => {
      media?.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  return printing;
}
