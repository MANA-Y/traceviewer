import {
  CODE_FONT_LABELS,
  CODE_FONTS,
  CODE_FONT_STACKS,
  FONT_FAMILIES,
  FONT_FAMILY_LABELS,
  FONT_FAMILY_STACKS,
  usePresentationSettings,
} from './presentationSettings';

export default function FontControl({ kind = 'ui' }) {
  const [settings, setSettings] = usePresentationSettings();
  const isCode = kind === 'code';

  return (
    <label className="font-control">
      <span>{isCode ? 'Code' : 'Font'}</span>
      <select
        aria-label={isCode ? 'Code font' : 'Presentation font'}
        value={isCode ? settings.codeFont : settings.fontFamily}
        onChange={(event) => setSettings(
          isCode ? { codeFont: event.target.value } : { fontFamily: event.target.value },
        )}
      >
        {(isCode ? CODE_FONTS : FONT_FAMILIES).map((value) => (
          <option
            key={value}
            value={value}
            style={{ fontFamily: isCode ? CODE_FONT_STACKS[value] : FONT_FAMILY_STACKS[value] }}
          >
            {isCode ? CODE_FONT_LABELS[value] : FONT_FAMILY_LABELS[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
