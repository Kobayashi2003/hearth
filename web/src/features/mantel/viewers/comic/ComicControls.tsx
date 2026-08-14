import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { BookOpenText } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  MenuChoice,
  MenuLabel,
  menuContentClass,
  menuSeparatorClass,
} from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/primitives';
import type { Fit, Flow, Spread } from './useComicReader';

/**
 * How the comic is read, as one labelled menu. Named choices with a tick beside
 * the one in force say what a control does *and* what it is set to — which an
 * icon button that shows its current state and changes it on click cannot.
 */

const FITS: Array<{ value: Fit; label: string; hint: string }> = [
  { value: 'height', label: 'Fit the page', hint: 'The whole page, no scrolling' },
  { value: 'width', label: 'Fit the width', hint: 'Fill the window and scroll down' },
  { value: 'original', label: 'Original size', hint: 'Every pixel, scroll both ways' },
];

const SPREADS: Array<{ value: Spread; label: string }> = [
  { value: 'single', label: 'One page' },
  { value: 'double', label: 'Two pages side by side' },
];

const FLOWS: Array<{ value: Flow; label: string }> = [
  { value: 'ltr', label: 'Left to right' },
  { value: 'rtl', label: 'Right to left (manga)' },
];

export function ComicControls({
  spread,
  fit,
  flow,
  onSpread,
  onFit,
  onFlow,
}: {
  spread: Spread;
  fit: Fit;
  flow: Flow;
  onSpread: (value: Spread) => void;
  onFit: (value: Fit) => void;
  onFlow: (value: Flow) => void;
}) {
  return (
    <DropdownMenu.Root>
      <Tooltip label="How this comic is read">
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="How this comic is read">
            <BookOpenText className="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${menuContentClass} min-w-56`}>
          <MenuLabel>Page size</MenuLabel>
          {FITS.map(option => (
            <MenuChoice
              key={option.value}
              label={option.label}
              hint={option.hint}
              isCurrent={fit === option.value}
              onSelect={() => onFit(option.value)}
            />
          ))}

          <DropdownMenu.Separator className={menuSeparatorClass} />
          <MenuLabel>Layout</MenuLabel>
          {SPREADS.map(option => (
            <MenuChoice
              key={option.value}
              label={option.label}
              isCurrent={spread === option.value}
              onSelect={() => onSpread(option.value)}
            />
          ))}

          <DropdownMenu.Separator className={menuSeparatorClass} />
          <MenuLabel>Reading direction</MenuLabel>
          {FLOWS.map(option => (
            <MenuChoice
              key={option.value}
              label={option.label}
              isCurrent={flow === option.value}
              onSelect={() => onFlow(option.value)}
            />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
