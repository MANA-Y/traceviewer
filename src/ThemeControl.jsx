import { useTheme } from './theme';

const labels = { light: 'Light', dark: 'Dark', system: 'System' };

export default function ThemeControl() {
  const [theme, setTheme] = useTheme();
  return (
    <label className="theme-control">
      <span>Theme</span>
      <select aria-label="Color theme" value={theme} onChange={(event) => setTheme(event.target.value)}>
        {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
  );
}
