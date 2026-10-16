import { createContext, use } from 'react';

export interface ShellValue {
  openSettings: () => void;
  /**
   * Present while the sidebar is out of sight: a drawer on narrow screens, or
   * put away on a wide one. `navKind` says which, for the button's look.
   */
  openNav?: (() => void) | undefined;
  navKind: 'drawer' | 'hidden' | null;
  rootLabel: string;
}

export const ShellContext = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const value = use(ShellContext);
  if (!value) throw new Error('useShell must be used inside AppShell');
  return value;
}
