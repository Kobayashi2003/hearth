import { createContext, use, useCallback, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Identity, PermissionAction } from '@hearth/shared';

import { api } from '@/lib/api';

interface SessionValue {
  identity: Identity | null;
  isLoading: boolean;
  adminOnly: boolean;
  /** UI gating only; the server enforces independently. */
  can: (action: PermissionAction) => boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);
const SESSION_KEY = ['session'] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: SESSION_KEY,
    queryFn: () => api.session(),
    // The cookie can expire while the tab sits open.
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    retry: false,
  });

  const signIn = useCallback(
    async (username: string, password: string) => {
      const response = await api.logIn(username, password);
      // A different user may see a different tree; nothing else cached still applies.
      queryClient.removeQueries({ predicate: query => query.queryKey[0] !== SESSION_KEY[0] });
      queryClient.setQueryData(SESSION_KEY, response);
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    await api.logOut();
    queryClient.removeQueries({ predicate: query => query.queryKey[0] !== SESSION_KEY[0] });
    queryClient.setQueryData(SESSION_KEY, {
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
