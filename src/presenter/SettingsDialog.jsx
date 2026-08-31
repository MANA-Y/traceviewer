import { useEffect, useState } from 'react';
import ThemeControl from '../ThemeControl';
import {
  CODE_FONT_LABELS,
  CODE_FONTS,
  CODE_FONT_STACKS,
  FONT_FAMILIES,
  FONT_FAMILY_LABELS,
  FONT_FAMILY_STACKS,
  IMAGE_FIT_LABELS,
  IMAGE_FITS,
  PDF_STYLE_LABELS,
  PDF_STYLES,
  STEP_HIGHLIGHT_LABELS,
  STEP_HIGHLIGHTS,
  TEXT_SCALE_LABELS,
  TEXT_SCALES,
  usePresentationSettings,
} from '../presentationSettings';

const SECTIONS = [
  { id: 'main', label: 'Основные' },
  { id: 'ui', label: 'Настройки UI' },
  { id: 'other', label: 'Прочие' },
];

function SettingsToggle({ label, checked, onChange }) {
  return (
    <label className="settings-row">
      <span>{label}</span>
      <input type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
    </label>
  );
}

function FullscreenControl() {
  const [active, setActive] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const sync = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  if (!document.documentElement.requestFullscreen) {
    return null;
  }

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  return (
    <label className="settings-row">
      <span>Fullscreen</span>
      <button type="button" onClick={toggle}>
        {active ? 'Exit' : 'Enter'}
      </button>
    </label>
  );
}

export default function SettingsDialog({
  animateMode,
  presenterMode,
  rawMode,
  notesMode,
  canOpenNotes,
  notesUrl,
  onToggleAnimate,
  onTogglePresenter,
  onToggleRaw,
  onOpenNotes,
  onShowSlides,
  onExportPdf,
  onClose,
}) {
  const [section, setSection] = useState('main');
  const [settings, setSettings] = usePresentationSettings();
  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];

  return (
    <div className="shortcut-help-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="shortcut-help-dialog settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="presentation-settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="presentation-settings-title">Presentation settings</h2>
          <button type="button" aria-label="Close settings" onClick={onClose}>×</button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" role="tablist" aria-label="Settings sections">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={item.id === current.id}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="settings-panel" role="tabpanel" aria-label={current.label}>
            <div className="settings-rows">
              {current.id === 'main' && <>
                <SettingsToggle
                  label="Progressive reveal"
                  checked={animateMode}
                  onChange={onToggleAnimate}
                />
                <SettingsToggle
                  label="Scroll to section start"
                  checked={settings.scrollToSection}
                  onChange={(event) => setSettings({ scrollToSection: event.target.checked })}
                />
                {notesMode ? (
                  <label className="settings-row">
                    <span>Slides in this window</span>
                    <button type="button" onClick={onShowSlides}>Show</button>
                  </label>
                ) : (
                  <SettingsToggle
                    label="Presenter view"
                    checked={presenterMode}
                    onChange={onTogglePresenter}
                  />
                )}
                {canOpenNotes && (
                  <label className="settings-row">
                    <span>Notes window</span>
                    <button type="button" onClick={onOpenNotes}>Open</button>
                  </label>
                )}
                {notesUrl && (
                  <label className="settings-row">
                    <span>Notes on phone</span>
                    <button type="button" onClick={() => navigator.clipboard.writeText(notesUrl)}>
                      Copy link
                    </button>
                  </label>
                )}
                {onExportPdf && (
                  <label className="settings-row">
                    <span>PDF style</span>
                    <select
                      aria-label="PDF export style"
                      value={settings.pdfStyle}
                      onChange={(event) => setSettings({ pdfStyle: event.target.value })}
                    >
                      {PDF_STYLES.map((value) => (
                        <option key={value} value={value}>{PDF_STYLE_LABELS[value]}</option>
                      ))}
                    </select>
                  </label>
                )}
                {onExportPdf && (
                  <label className="settings-row">
                    <span>Export PDF</span>
                    <button type="button" aria-label="Save presentation as PDF" onClick={onExportPdf}>
                      Save
                    </button>
                  </label>
                )}
              </>}
              {current.id === 'ui' && <>
                <div className="settings-row">
                  <ThemeControl />
                </div>
                <label className="settings-row">
                  <span>Text size</span>
                  <select
                    aria-label="Presentation text size"
                    value={settings.textScale}
                    onChange={(event) => setSettings({ textScale: event.target.value })}
                  >
                    {TEXT_SCALES.map((value) => (
                      <option key={value} value={value}>{TEXT_SCALE_LABELS[value]}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-row">
                  <span>Font</span>
                  <select
                    aria-label="Presentation font"
                    value={settings.fontFamily}
                    onChange={(event) => setSettings({ fontFamily: event.target.value })}
                  >
                    {FONT_FAMILIES.map((value) => (
                      <option key={value} value={value} style={{ fontFamily: FONT_FAMILY_STACKS[value] }}>
                        {FONT_FAMILY_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-row">
                  <span>Code font</span>
                  <select
                    aria-label="Code font"
                    value={settings.codeFont}
                    onChange={(event) => setSettings({ codeFont: event.target.value })}
                  >
                    {CODE_FONTS.map((value) => (
                      <option key={value} value={value} style={{ fontFamily: CODE_FONT_STACKS[value] }}>
                        {CODE_FONT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="settings-row">
                  <span>Images</span>
                  <select
                    aria-label="Presentation image size"
                    value={settings.imageFit}
                    onChange={(event) => setSettings({ imageFit: event.target.value })}
                  >
                    {IMAGE_FITS.map((value) => (
                      <option key={value} value={value}>{IMAGE_FIT_LABELS[value]}</option>
                    ))}
                  </select>
                </label>
                <label className="settings-row">
                  <span>Step highlight</span>
                  <select
                    aria-label="Step highlight color"
                    value={settings.stepHighlight}
                    onChange={(event) => setSettings({ stepHighlight: event.target.value })}
                  >
                    {STEP_HIGHLIGHTS.map((value) => (
                      <option key={value} value={value}>{STEP_HIGHLIGHT_LABELS[value]}</option>
                    ))}
                  </select>
                </label>
                <SettingsToggle
                  label="Line numbers"
                  checked={settings.showLineNumbers}
                  onChange={(event) => setSettings({ showLineNumbers: event.target.checked })}
                />
                <SettingsToggle
                  label="Pin headings"
                  checked={settings.pinHeadings}
                  onChange={(event) => setSettings({ pinHeadings: event.target.checked })}
                />
                <SettingsToggle
                  label="Center headings"
                  checked={settings.centerHeadings}
                  onChange={(event) => setSettings({ centerHeadings: event.target.checked })}
                />
                <SettingsToggle
                  label="Center blocks"
                  checked={settings.centerBlocks}
                  onChange={(event) => setSettings({ centerBlocks: event.target.checked })}
                />
              </>}
              {current.id === 'other' && <>
                {!notesMode && (
                  <SettingsToggle
                    label="Source view"
                    checked={rawMode}
                    onChange={onToggleRaw}
                  />
                )}
                <FullscreenControl />
              </>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
