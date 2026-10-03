import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AdminSettingsPatch,
  AdminSettingsResponse,
  SettingKey,
  SettingState,
} from '@hearth/shared';

import { api } from '@/lib/api';
import { Input, SettingRow, Switch } from '@/ui/Field';

const KEY = ['admin-settings'];

/** The administrator's settings: .env gives each its default, an override here wins until reset. */
export function useAdminSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: () => api.adminSettings() });
  const change = useMutation({
    mutationFn: (patch: AdminSettingsPatch) => api.changeSettings(patch),
    onSuccess: data => {
      queryClient.setQueryData<AdminSettingsResponse>(KEY, data);
      // Whatever reads these (the recycle bin, an open HTML page) asks again.
      void queryClient.invalidateQueries({ queryKey: ['trash-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['html'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const find = (key: SettingKey) => query.data?.settings.find(setting => setting.key === key);
  return { find, change: (patch: AdminSettingsPatch) => change.mutate(patch) };
}

const UNIT_LABEL: Record<NonNullable<SettingState['unit']>, string> = {
  count: '',
  MB: 'MB',
  days: 'days',
  ms: 'ms',
};

function describeValue(setting: SettingState, value: boolean | number): string {
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (setting.kind === 'limit' && value === 0) return 'no limit';
  const unit = setting.unit ? UNIT_LABEL[setting.unit] : '';
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ''}`;
}

/** Where the value comes from, and a way back to .env once it has been changed here. */
function Origin({ setting, onReset }: { setting: SettingState; onReset: () => void }) {
  if (!setting.overridden) return null;
  return (
    <span className="mt-1 block text-[12px] text-ink-3">
      Changed here; {setting.variable} gives {describeValue(setting, setting.default)}.{' '}
      <button type="button" onClick={onReset} className="text-glaze-strong hover:underline">
        Use that
      </button>
    </span>
  );
}

export function SettingSwitch({
  name,
  title,
  description,
  disabled,
}: {
  name: SettingKey;
  title: string;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const { find, change } = useAdminSettings();
  const setting = find(name);
  return (
    <SettingRow
      title={title}
      description={
        <>
          {description}
          {setting ? <Origin setting={setting} onReset={() => change({ [name]: null })} /> : null}
        </>
      }
    >
      <Switch
        checked={setting?.value === true}
        onChange={value => change({ [name]: value })}
        label={title}
        disabled={!setting || disabled}
      />
    </SettingRow>
  );
}

/**
 * A number, saved when the field is left or Enter is pressed. A limit offers
 * "no limit" (sent as 0); a safeguard always needs a positive number.
 */
export function SettingNumber({
  name,
  title,
  description,
}: {
  name: SettingKey;
  title: string;
  description?: ReactNode;
}) {
  const { find, change } = useAdminSettings();
  const setting = find(name);
  const value = typeof setting?.value === 'number' ? setting.value : 0;
  const unlimited = setting?.kind === 'limit' && value === 0;
  const [draft, setDraft] = useState('');
  useEffect(() => setDraft(unlimited ? '' : String(value)), [value, unlimited]);

  const commit = () => {
    const parsed = Number.parseInt(draft, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDraft(unlimited ? '' : String(value));
      return;
    }
    if (parsed !== value) change({ [name]: parsed });
  };

  const unit = setting?.unit ? UNIT_LABEL[setting.unit] : '';
  return (
    <SettingRow
      title={title}
      description={
        <>
          {description}
          {setting ? <Origin setting={setting} onReset={() => change({ [name]: null })} /> : null}
        </>
      }
    >
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={draft}
          placeholder={unlimited ? 'No limit' : undefined}
          disabled={!setting || unlimited}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') commit();
          }}
          aria-label={title}
          className="w-28 text-right tabular"
        />
        {/* Fixed slots, so every row's field lines up whether or not it has a unit or "no limit". */}
        <span className="w-9 text-[12.5px] text-ink-3">{unit}</span>
        <span className="flex w-[5.25rem] items-center">
          {setting?.kind === 'limit' ? (
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              <input
                type="checkbox"
                checked={unlimited}
                onChange={event =>
                  change({ [name]: event.target.checked ? 0 : unlimitedFallback(setting) })
                }
                className="accent-[var(--glaze)]"
              />
              No limit
            </label>
          ) : null}
        </span>
      </div>
    </SettingRow>
  );
}

/** Turning "no limit" off needs some number: the .env default if it has one. */
function unlimitedFallback(setting: SettingState): number {
  return typeof setting.default === 'number' && setting.default > 0 ? setting.default : 1000;
}
