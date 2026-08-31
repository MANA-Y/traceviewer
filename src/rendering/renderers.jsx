import { useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import { getLast } from '../utils';
import { highlightCode } from './languages';
import { typesetMath } from './mathjax';
import { sanitizeMarkdown, sanitizeStyle, sanitizeUrl } from './security';
import StructuredRendering from './structuredRenderers';
import { usePrintLayout } from './usePrintLayout';


function MarkdownRenderer({ content, style }) {
  const elementRef = useRef(null);
  const renderedContent = useMemo(() => {
    const trailingWhitespace = content.endsWith(' ') ? '&nbsp;' : '';
    let markdown = marked(content);
    markdown = markdown.replace(/\n$/, '');
    markdown = markdown.replace(/^<p>/g, '').replace(/<\/p>$/g, '');
    return sanitizeMarkdown(markdown + trailingWhitespace);
  }, [content]);

  useEffect(() => {
    typesetMath(elementRef.current);
  }, [renderedContent]);

  return <span ref={elementRef} className="markdown" style={sanitizeStyle(style)} dangerouslySetInnerHTML={{ __html: renderedContent }} />;
}

function CodeRenderer({ content, language, style }) {
  const [highlighted, setHighlighted] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setHighlighted(null);
    highlightCode(content, language).then((value) => {
      if (!cancelled) setHighlighted(value);
    });
    return () => { cancelled = true; };
  }, [content, language]);
  return (
    <pre className={`code-block language-${language || 'plaintext'}`} style={sanitizeStyle(style)}>
      {highlighted === null
        ? <code>{content}</code>
        : <code dangerouslySetInnerHTML={{ __html: highlighted }} />}
    </pre>
  );
}

function normalizeFocus(value) {
  if (!value || typeof value !== 'object') return null;
  const focus = {
    x: Number(value.x), y: Number(value.y),
    width: Number(value.width), height: Number(value.height),
  };
  if (!Object.values(focus).every(Number.isFinite) || focus.x < 0 || focus.y < 0 ||
      focus.width <= 0 || focus.height <= 0 || focus.x + focus.width > 100 ||
      focus.y + focus.height > 100) return null;
  return focus;
}

function normalizeOverlays(values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    const x = Number(value?.x), y = Number(value?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 ||
        y < 0 || y > 100 || typeof value?.text !== 'string' || !value.text.trim()) return [];
    return [{ x, y, text: value.text, title: typeof value.title === 'string' ? value.title : '', focus: normalizeFocus(value.focus) }];
  });
}

/* Print keeps the numbered dots on the figure and spells them out underneath,
   so no label can cover the picture or squeeze it into a corner. */
function PrintCalloutLegend({ overlays }) {
  if (overlays.length === 0) return null;
  return (
    <ol className="print-callout-legend">
      {overlays.map((overlay, index) => (
        <li key={index}>
          <span className="print-callout-index">{index + 1}</span>
          <div className="print-callout-body">
            {overlay.title ? <strong>{overlay.title}</strong> : null}
            <span>{overlay.text}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ImageRenderer({ rendering, imageUrl, style, printExport = false }) {
  const initialFocus = useMemo(() => normalizeFocus(rendering.focus), [rendering.focus]);
  const overlays = useMemo(() => normalizeOverlays(rendering.overlays), [rendering.overlays]);
  const printLayout = usePrintLayout();
  const [activeOverlay, setActiveOverlay] = useState(null);
  const [showOverview, setShowOverview] = useState(false);
  const [naturalSize, setNaturalSize] = useState(null);

  useEffect(() => {
    setActiveOverlay(null);
    setShowOverview(false);
    setNaturalSize(null);
  }, [rendering.data, rendering.focus, rendering.overlays]);

  const expandForPrint = printExport || printLayout;
  const focus = expandForPrint || showOverview ? null : initialFocus;
  const isFocused = Boolean(focus);
  const viewportStyle = isFocused && naturalSize
    ? { aspectRatio: `${naturalSize.w * focus.width / 100} / ${naturalSize.h * focus.height / 100}` }
    : undefined;
  const stageStyle = isFocused
    ? {
      width: `${10000 / focus.width}%`,
      left: `${-(focus.x / focus.width) * 100}%`,
      top: `${-(focus.y / focus.height) * 100}%`,
    }
    : undefined;
  return <figure className={`annotated-image${isFocused ? ' is-focused' : ''}${overlays.length ? ' has-print-callouts' : ''}`} style={style}>
    <div className="annotated-image-viewport" style={viewportStyle}>
      <div className="annotated-image-clip">
        <div className="annotated-image-stage" style={stageStyle}>
          <img
            src={imageUrl}
            alt={rendering.alt ?? ''}
            loading="eager"
            onLoad={(event) => {
              const image = event.currentTarget;
              setNaturalSize({ w: image.naturalWidth, h: image.naturalHeight });
            }}
          />
        </div>
      </div>
      <div className="annotated-image-overlays">
        {overlays.map((overlay, index) => {
          const left = isFocused ? ((overlay.x - focus.x) / focus.width) * 100 : overlay.x;
          const top = isFocused ? ((overlay.y - focus.y) / focus.height) * 100 : overlay.y;
          if (left < -8 || left > 108 || top < -8 || top > 108) return null;
          const active = activeOverlay === index;
          const tooltipBelow = top < 28;
          return <button
            key={index}
            type="button"
            className={`image-overlay-marker${active ? ' is-active' : ''}${tooltipBelow ? ' is-below' : ''}`}
            style={{ left: `${left}%`, top: `${top}%` }}
            aria-label={overlay.title || overlay.text}
            aria-expanded={active}
            onClick={() => {
              setShowOverview(false);
              setActiveOverlay(active ? null : index);
            }}
          >
            <span className="image-overlay-dot" aria-hidden="true">{index + 1}</span>
            <span className="image-overlay-tooltip" role="tooltip">
              {overlay.title && <strong>{overlay.title}</strong>}
              <span>{overlay.text}</span>
            </span>
          </button>;
        })}
      </div>
      {isFocused && <button
        type="button"
        className="image-overview-button"
        onClick={() => { setActiveOverlay(null); setShowOverview(true); }}
      >Overview</button>}
    </div>
    {rendering.alt ? <figcaption className="print-figure-caption">{rendering.alt}</figcaption> : null}
    <PrintCalloutLegend overlays={overlays} />
  </figure>;
}

const STRUCTURED_TYPES = new Set([
  'table', 'chart', 'timeline', 'graph', 'callout', 'columns', 'metrics', 'quote',
  'divider', 'section', 'terminal', 'diff', 'steps',
]);

function getReferenceAnchorText(reference) {
  if (Array.isArray(reference.authors) && reference.authors.length > 0) {
    const lastName = getLast(reference.authors[0].split(' '));
    const plus = reference.authors.length > 1 ? '+' : '';
    const year = reference.date && reference.date.split('-')[0];
    return `[${lastName}${plus} ${year}]`;
  }
  return reference.title || reference.url;
}

function renderAuthors(authors) {
  const maxAuthors = 10;
  if (authors.length > maxAuthors) {
    const numOmitted = authors.length - maxAuthors;
    return authors.slice(0, maxAuthors / 2).join(', ') + ` ... (${numOmitted} more) ... ` + authors.slice(-maxAuthors / 2).join(', ');
  }
  return authors.join(', ');
}

function ExternalLink({ link, style }) {
  const safeUrl = sanitizeUrl(link.url);
  const anchorText = getReferenceAnchorText(link);
  if (!safeUrl) return <span className="renderer-error">[unsafe link blocked]</span>;
  if (!link.title) {
    return <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={sanitizeStyle(style)}>{anchorText}</a>;
  }
  const notes = link.notes && link.notes.split(/\n/).map((line, index) => <div key={index}>{line}</div>);
  const org = link.organization && `[${link.organization}] `;
  return (
    <div className="link-container" style={{ display: 'inline-block', position: 'relative' }}>
      <a href={safeUrl} target="_blank" rel="noopener noreferrer" style={sanitizeStyle(style)} className="external-link">
        {anchorText}
      </a>
      <div className="link-hover-panel">
        {link.title && <div className="link-title">{link.title}</div>}
        {link.authors && <div className="link-authors">{org}{renderAuthors(link.authors)}</div>}
        {link.date && <div className="link-date">{typeof link.date === 'string' ? link.date.split('T')[0] : ''}</div>}
        {link.description && <div className="link-description">{link.description}</div>}
        {link.notes && <div className="link-notes">{notes}</div>}
      </div>
    </div>
  );
}

export function Rendering({ rendering, onInternalLink, printExport = false }) {
  const style = sanitizeStyle(rendering.style);
  if (STRUCTURED_TYPES.has(rendering.type)) {
    return <StructuredRendering rendering={rendering} />;
  }
  const renderers = {
    markdown: () => <MarkdownRenderer content={String(rendering.data ?? '')} style={style} />,
    code: () => <CodeRenderer content={String(rendering.data ?? '')} language={rendering.language} style={style} />,
    image: () => {
      const imageUrl = sanitizeUrl(rendering.data, { allowDataImage: true });
      return imageUrl
        ? <ImageRenderer rendering={rendering} imageUrl={imageUrl} style={style} printExport={printExport} />
        : <span className="renderer-error">[unsafe image blocked]</span>;
    },
    link: () => {
      if (rendering.internal_link) {
        const link = rendering.internal_link;
        const anchorText = rendering.data || `${link.path}:${link.line_number}`;
        return <a href="#" style={style} onClick={(event) => {
          event.preventDefault();
          onInternalLink(link);
        }}>{anchorText}</a>;
      }
      return rendering.external_link ? <ExternalLink link={rendering.external_link} style={style} /> : null;
    },
  };
  return renderers[rendering.type]?.() ?? <span style={style}>{String(rendering.data ?? '')}</span>;
}
