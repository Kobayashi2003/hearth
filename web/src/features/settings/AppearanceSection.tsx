import { useQuery } from '@tanstack/react-query';
import { Monitor, Moon, SunMedium } from 'lucide-react';
import type { Density, Theme } from '@hearth/shared';

import { api } from '@/lib/api';
import { usePreferences } from '@/features/preferences/preferences';
import { Segmented, Select, SettingRow, Switch } from '@/ui/Field';

export function AppearanceSection() {
  const { preferences, update } = usePreferences();
  const backgrounds = useQuery({
    queryKey: ['backgrounds'],
    queryFn: () => api.backgrounds(),
    staleTime: 60_000,
  });

  return (
    <div className="divide-y divide-line">
      <SettingRow title="Theme">
        <Segmented<Theme>
          label="Theme"
          value={preferences.theme}
          onChange={value => update('theme', value)}
          options={[
            { value: 'light', label: <SunMedium />, title: 'Light' },
            { value: 'dark', label: <Moon />, title: 'Dark' },
            { value: 'system', label: <Monitor />, title: 'Follow the system' },
          ]}
        />
      </SettingRow>
      <SettingRow title="Density" description="Row height adapts to touch or mouse either way.">
        <Segmented<Density>
          label="Density"
          value={preferences.density}
          onChange={value => update('density', value)}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </SettingRow>
      <SettingRow title="Cover size" description="How wide each tile is in the cover view.">
        <input
          type="range"
          min={96}
          max={320}
          step={8}
          value={preferences.gridSize}
          onChange={event => update('gridSize', Number(event.target.value))}
          aria-label="Cover size"
          className="w-40 accent-[var(--glaze)]"
        />
      </SettingRow>
      <SettingRow
        title="Folder covers"
        description="A folder shows the first picture inside it. Worth it for a library of books or photos; costs a scan per folder."
      >
        <Switch
          checked={preferences.folderCovers}
          onChange={value => update('folderCovers', value)}
          label="Folder covers"
        />
      </SettingRow>
      <SettingRow
        title="Wallpaper"
        description={
          backgrounds.data?.backgrounds.length
            ? 'Pictures from the server’s backgrounds folder.'
            : 'Put pictures in server/backgrounds to choose one here.'
        }
      >
        <Select
          value={preferences.wallpaper ?? ''}
          onChange={event => update('wallpaper', event.target.value || null)}
          className="w-44"
          aria-label="Wallpaper"
        >
          <option value="">None</option>
          {backgrounds.data?.backgrounds.map(name => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </SettingRow>
      {preferences.wallpaper ? (
        <SettingRow title="Wallpaper strength">
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={preferences.wallpaperOpacity}
            onChange={event => update('wallpaperOpacity', Number(event.target.value))}
            aria-label="Wallpaper strength"
            className="w-40 accent-[var(--glaze)]"
          />
        </SettingRow>
      ) : null}
    </div>
  );
}
