import { useQuery } from '@tanstack/react-query';

import { Field, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useShell } from '@/features/shell/AppShell';

/** Personal display settings — stored in the browser, not on the server. */
export function AppearanceSection() {
  const { preferences, updatePreference } = useShell();
  const { data } = useQuery({ queryKey: ['backgrounds'], queryFn: () => api.backgrounds() });

  return (
    <div className="space-y-5">
      <Field label="Theme">
        <Select
          value={preferences.theme}
          onChange={event => updatePreference('theme', event.target.value as typeof preferences.theme)}
        >
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </Select>
      </Field>

      <Field label="Row density" hint="Compact fits more on screen; comfortable is easier to tap.">
        <Select
          value={preferences.density}
          onChange={event => updatePreference('density', event.target.value as typeof preferences.density)}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </Select>
      </Field>

      <Field label="Grid tile size">
        <input
          type="range"
          min={96}
          max={280}
          step={8}
          value={preferences.gridSize}
          onChange={event => updatePreference('gridSize', Number(event.target.value))}
          className="accent-[var(--accent)]"
        />
      </Field>

      <Field label="Background image">
        <Select
          value={preferences.wallpaper ?? ''}
          onChange={event => updatePreference('wallpaper', event.target.value || null)}
        >
          <option value="">None</option>
          {(data?.backgrounds ?? []).map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </Select>
      </Field>

      {preferences.wallpaper ? (
        <Field label={`Background opacity — ${Math.round(preferences.wallpaperOpacity * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={preferences.wallpaperOpacity}
            onChange={event => updatePreference('wallpaperOpacity', Number(event.target.value))}
            className="accent-[var(--accent)]"
          />
        </Field>
      ) : null}
    </div>
  );
}
