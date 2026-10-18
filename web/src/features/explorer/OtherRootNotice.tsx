import { HardDrive } from 'lucide-react';
import type { RootDescriptor } from '@hearth/shared';

import { useSession } from '@/features/session/session';
import { useRootSwitch } from '@/features/shell/root-switch';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Feedback';
import { explorerRoute } from './search';

/**
 * In place of the listing when the URL's folder is in a root other than the
 * one served (a restored tab, a bookmark, a tab left open across a switch).
 * The same path in the served root would be another folder or none at all.
 * An admin can serve that root again and stay on the folder; anyone can go to
 * the top of the root served now.
 */
export function OtherRootNotice({
  wanted,
  served,
}: {
  /** The root the URL names, or null when Hearth no longer has it. */
  wanted: RootDescriptor | null;
  served: RootDescriptor | undefined;
}) {
  const { can } = useSession();
  const switchRoot = useRootSwitch();
  const navigate = explorerRoute.useNavigate();
  const servedLabel = served?.label ?? 'another root';
  const canSwitch = wanted !== null && wanted.available && can('admin');

  const toTop = () =>
    void navigate({
      search: current => ({
        ...current,
        path: '',
        q: '',
        type: undefined,
        reveal: undefined,
        scope: 'below',
        root: served?.id,
      }),
    });

  return (
    <Notice
      icon={<HardDrive />}
      title="This folder is in another root"
      body={
        wanted
          ? `It is in ${wanted.label}${wanted.available ? '' : ', which is not connected'}, and Hearth is serving ${servedLabel} now.`
          : `It is in a root Hearth no longer serves; Hearth is serving ${servedLabel}.`
      }
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {canSwitch ? (
            <Button variant="primary" onClick={() => void switchRoot(wanted.id, () => undefined)}>
              Serve {wanted.label}
            </Button>
          ) : null}
          <Button variant="outline" onClick={toTop}>
            Go to the top of {servedLabel}
          </Button>
        </div>
      }
    />
  );
}
