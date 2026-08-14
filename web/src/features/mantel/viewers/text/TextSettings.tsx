import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Type } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import {
  MenuChoice,
  MenuLabel,
  MenuStepper,
  menuContentClass,
  menuSeparatorClass,
} from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/primitives';
import {
  LINE_HEIGHTS,
  SCALES,
  type Measure,
  type ReadingStyle,
  type Typeface,
} from './useReadingStyle';

/**
 * Reading settings, and the file's encoding, behind one control.
 *
 * The encoding used to sit open in the header as a select box — a permanent
 * dropdown of eight character sets above every text file, for a setting that
 * matters on perhaps one file in fifty. It matters enormously on that one, so it
 * is still here, at the bottom, under a heading that says what it is for.
 */

const TYPEFACES: Array<{ value: Typeface; label: string }> = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Monospace' },
];

const MEASURES: Array<{ value: Measure; label: string }> = [
  { value: 'narrow', label: 'Narrow column' },
  { value: 'wide', label: 'Wide column' },
  { value: 'full', label: 'Full width' },
];

export function TextSettings({
  style,
  onChange,
  encoding,
  encodings,
  onEncoding,
}: {
  style: ReadingStyle;
  onChange: <K extends keyof ReadingStyle>(key: K, value: ReadingStyle[K]) => void;
  encoding: string;
  encodings: string[];
  onEncoding: (encoding: string) => void;
}) {
  return (
    <DropdownMenu.Root>
      <Tooltip label="How this text is set">
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="How this text is set">
            <Type className="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={`${menuContentClass} min-w-56`}>
          <MenuStepper
            label="Text size"
            value={style.scale}
            values={SCALES}
            format={value => `${Math.round(value * 100)}%`}
            onChange={value => onChange('scale', value)}
            decreaseLabel="Smaller text"
            increaseLabel="Larger text"
          />
          <MenuStepper
            label="Line spacing"
            value={style.lineHeight}
            values={LINE_HEIGHTS}
            format={value => value.toFixed(1)}
            onChange={value => onChange('lineHeight', value)}
            decreaseLabel="Tighter lines"
            increaseLabel="Looser lines"
          />

          <DropdownMenu.Separator className={menuSeparatorClass} />
          <MenuLabel>Typeface</MenuLabel>
          {TYPEFACES.map(option => (
            <MenuChoice
              key={option.value}
              label={option.label}
              isCurrent={style.typeface === option.value}
              onSelect={() => onChange('typeface', option.value)}
            />
          ))}

          <DropdownMenu.Separator className={menuSeparatorClass} />
          <MenuLabel>Line length</MenuLabel>
          {MEASURES.map(option => (
            <MenuChoice
              key={option.value}
              label={option.label}
              isCurrent={style.measure === option.value}
              onSelect={() => onChange('measure', option.value)}
            />
          ))}

          <DropdownMenu.Separator className={menuSeparatorClass} />
          <MenuLabel>Character set — change it if the text looks like nonsense</MenuLabel>
          {encodings.map(candidate => (
            <MenuChoice
              key={candidate}
              label={candidate}
              isCurrent={encoding === candidate}
              onSelect={() => onEncoding(candidate)}
            />
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
