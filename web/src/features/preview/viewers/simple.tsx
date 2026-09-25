import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { Centered, Notice, Spinner } from '@/ui/Feedback';

/** Loading and error states shared by the viewers that fetch one document and render it. */
export function Loaded<T>({
  query,
  failure,
  children,
}: {
  query: UseQueryResult<T>;
  failure: string;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    );
  }
  if (query.error) return <Notice title={failure} body={query.error.message} />;
  return <>{children(query.data as T)}</>;
}
