import { useEffect, useState, type FormEvent } from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { Input } from './Field';

/** Ask for a name: a new folder, a rename, a favorite's own label. */
export function NameDialog({
  open,
  title,
  action,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  action: string;
  initial: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === initial) return onClose();
    onSubmit(trimmed);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={next => !next && onClose()} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-4 pb-4">
        <Input
          value={name}
          onChange={event => setName(event.target.value)}
          autoFocus
          aria-label="Name"
          onFocus={event => {
            // Select the name without its extension, as a desktop file manager does.
            const dot = event.target.value.lastIndexOf('.');
            event.target.setSelectionRange(0, dot > 0 ? dot : event.target.value.length);
          }}
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {action}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
