// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { PreferencesProvider, usePreferences } from '@/features/preferences/preferences';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('PreferencesProvider', () => {
  it('fills in what an older server does not know yet, instead of leaving it undefined', async () => {
    // A server from before favorites and the reader theme existed.
    vi.spyOn(api, 'preferences').mockResolvedValue({
      theme: 'dark',
      density: 'compact',
      viewMode: 'grid',
      wallpaper: null,
      wallpaperOpacity: 0.25,
      gridSize: 168,
      folderCovers: false,
    } as never);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(PreferencesProvider, null, children);

    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => expect(result.current.preferences.theme).toBe('dark'));
    expect(result.current.preferences.favorites).toEqual([]);
    expect(result.current.preferences.readerTheme).toBe('hearth');
  });
});
