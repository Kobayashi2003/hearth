import { createContext, use, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Identity, PermissionAction } from '@hearth/shared';

import { api } from '@/lib/api';

interface SessionValue {
  identity: Identity | null;
  isLoading: boolean;
  adminOnly: boolean;
  /** Permission gate for the UI. The server enforces independently. */
  can: (action: PermissionAction) => boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const SESSION_QUERY_KEY = ['session'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.session(),
    // The cookie can expire while the tab sits open; re-checking on focus is
    // what turns a silent 401 into a re-login prompt at the right moment.
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    retry: false,
  });

  const signIn = useCallback(
    async (username: string, password: string) => {
      const response = await api.logIn(username, password);
      queryClient.setQueryData(SESSION_QUERY_KEY, response);
      // A different user may see a different tree; nothing cached still applies.
      await queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api.logOut();
    queryClient.clear();
    queryClient.setQueryData(SESSION_QUERY_KEY, {
      authenticated: false,
      identity: null,
      adminOnly: data?.adminOnly ?? false,
    });
  }, [queryClient, data?.adminOnly]);

  const value = useMemo<SessionValue>(() => {
    const identity = data?.identity ?? null;
    return {
      identity,
      isLoading: isPending,
      adminOnly: data?.adminOnly ?? false,
      can: action => identity?.actions.includes(action) ?? false,
      signIn,
      signOut,
    };
  }, [data, isPending, signIn, signOut]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}
