import { createContext, use } from 'react';

export interface ShellValue {
  openSettings: () => void;
  /** Present when the sidebar is a drawer (narrow and medium widths). */
  openNav?: (() => void) | undefined;
  rootLabel: string;
}

export const ShellContext = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const value = use(ShellContext);
  if (!value) throw new Error('useShell must be used inside AppShell');
  return value;
}
