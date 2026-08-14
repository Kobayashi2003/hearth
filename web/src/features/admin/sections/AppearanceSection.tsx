import { useQuery } from '@tanstack/react-query';

import { Field, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { useShell } from '@/features/shell/AppShell';

/**
 * Personal display settings — Hob, kept per user on the server so a choice made
 * at the desk is in force on the phone. The one exception is the size each kind
 * of preview window opens at, which is measured in percentages of *this*
 * browser's window and so is stored in it.
 */
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

      <Field
        label="Home shelves"
        hint="Pinned and Continue, above the file list on the home folder."
      >
        <Select
          value={preferences.showShelves ? 'on' : 'off'}
          onChange={event => updatePreference('showShelves', event.target.value === 'on')}
        >
          <option value="on">Show</option>
          <option value="off">Hide</option>
        </Select>
      </Field>

      <Field
        label="Folder covers"
        hint="Show a folder using the first picture inside it. Costs a scan per folder, and in a folder of documents it says less than a plain icon."
      >
        <Select
          value={preferences.folderCovers ? 'on' : 'off'}
          onChange={event => updatePreference('folderCovers', event.target.value === 'on')}
        >
          <option value="off">Plain folder icons</option>
          <option value="on">Borrow a cover from inside</option>
        </Select>
      </Field>

      <Field
        label="Preview fullscreen"
        hint="The browser's own fullscreen hides the tab strip but swallows the page's shortcuts; filling the window keeps them. By default films, comics and books get the first and everything else the second."
      >
        <Select
          value={preferences.previewFullscreen}
          onChange={event =>
            updatePreference(
              'previewFullscreen',
              event.target.value as typeof preferences.previewFullscreen,
            )
          }
        >
          <option value="auto">Whichever suits the file</option>
          <option value="browser">Always the browser's fullscreen</option>
          <option value="window">Always fill the window</option>
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
