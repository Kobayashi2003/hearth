import { AArrowDown, AArrowUp, Languages, Pencil, Save, Type, WrapText, X } from 'lucide-react';

import { useIsNarrow } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Menu, MenuChoice, MenuItem, MenuLabel, MenuSeparator } from '@/ui/Menu';

const ENCODINGS: ReadonlyArray<[string, string]> = [
  ['utf8', 'UTF-8'],
  ['gb18030', 'GB18030 (Simplified Chinese)'],
  ['big5', 'Big5 (Traditional Chinese)'],
  ['shift_jis', 'Shift_JIS (Japanese)'],
  ['euc-kr', 'EUC-KR (Korean)'],
  ['utf16le', 'UTF-16 LE'],
  ['win1252', 'Windows-1252'],
];

export function EditActions({
  isSaving,
  onDiscard,
  onSave,
}: {
  isSaving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <>
      <Button variant="quiet" size="sm" onClick={onDiscard}>
        <X /> Discard
      </Button>
      <Button variant="primary" size="sm" onClick={onSave} disabled={isSaving}>
        <Save /> Save
      </Button>
    </>
  );
}

/** Text size, wrapping, the encoding to read it in, and Edit where that is allowed. */
export function ReadActions({
  wrap,
  encoding,
  onStep,
  onWrap,
  onEncoding,
  onEdit,
}: {
  wrap: boolean;
  encoding: string;
  onStep: (delta: 1 | -1) => void;
  onWrap: (wrap: boolean) => void;
  onEncoding: (encoding: string) => void;
  /** Absent when the user may not write or only part of the file was loaded. */
  onEdit: (() => void) | null;
}) {
  const narrow = useIsNarrow();
  const edit = onEdit ? (
    <Button variant="quiet" size="icon" onClick={onEdit} aria-label="Edit" title="Edit">
      <Pencil />
    </Button>
  ) : null;
  if (narrow) {
    // Five buttons crowd out the file name on a phone; reading options share one menu.
    return (
      <>
        <Menu
          trigger={
            <Button
              variant="quiet"
              size="icon"
              aria-label="Reading options"
              title="Reading options"
            >
              <Type />
            </Button>
          }
        >
          <MenuItem icon={<AArrowDown />} onSelect={() => onStep(-1)}>
            Smaller text
          </MenuItem>
          <MenuItem icon={<AArrowUp />} onSelect={() => onStep(1)}>
            Larger text
          </MenuItem>
          <MenuChoice checked={wrap} onSelect={() => onWrap(!wrap)}>
            Wrap long lines
          </MenuChoice>
          <MenuSeparator />
          <EncodingChoices encoding={encoding} onEncoding={onEncoding} />
        </Menu>
        {edit}
      </>
    );
  }
  return (
    <>
      <Button variant="quiet" size="icon" onClick={() => onStep(-1)} aria-label="Smaller text">
        <AArrowDown />
      </Button>
      <Button variant="quiet" size="icon" onClick={() => onStep(1)} aria-label="Larger text">
        <AArrowUp />
      </Button>
      <Button
        variant="quiet"
        size="icon"
        onClick={() => onWrap(!wrap)}
        aria-pressed={wrap}
        aria-label="Wrap long lines"
        title="Wrap long lines"
        className={cn(wrap && 'text-ember')}
      >
        <WrapText />
      </Button>
      <Menu
        trigger={
          <Button variant="quiet" size="icon" aria-label="Text encoding" title="Text encoding">
            <Languages />
          </Button>
        }
      >
        <EncodingChoices encoding={encoding} onEncoding={onEncoding} />
      </Menu>
      {edit}
    </>
  );
}

/** Rendered Markdown, highlighted code, or the plain text, in that order of preference. */
export function TextBody({
  content,
  markdown,
  highlighted,
  wrap,
  fontSize,
}: {
  content: string;
  markdown: string | null;
  highlighted: string | null;
  wrap: boolean;
  fontSize: number;
}) {
  if (markdown) {
    return (
      <article
        className="prose-doc mx-auto max-w-[72ch] px-6 py-8"
        dangerouslySetInnerHTML={{ __html: markdown }}
      />
    );
  }
  if (highlighted) {
    return (
      <div
        className={cn(
          'shiki-host px-5 py-4',
          wrap ? '[&_pre]:whitespace-pre-wrap [&_pre]:break-words' : '[&_pre]:whitespace-pre',
        )}
        style={{ fontSize }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    );
  }
  return (
    <pre
      className={cn(
        'px-5 py-4 font-mono leading-relaxed',
        wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
      )}
    >
      {content}
    </pre>
  );
}

export function TruncatedNote() {
  return (
    <p className="sticky top-0 z-10 border-b border-line bg-sunken px-5 py-2 text-[12.5px] text-ink-2">
      Only the beginning of this file is shown; it is too large to load whole. Download it to see
      the rest.
    </p>
  );
}

export function Editor({
  name,
  draft,
  wrap,
  fontSize,
  onChange,
}: {
  name: string;
  draft: string;
  wrap: boolean;
  fontSize: number;
  onChange: (draft: string) => void;
}) {
  return (
    <textarea
      value={draft}
      onChange={event => onChange(event.target.value)}
      spellCheck={false}
      wrap={wrap ? 'soft' : 'off'}
      autoFocus
      aria-label={`Editing ${name}`}
      style={{ fontSize }}
      className="absolute inset-0 resize-none bg-surface p-5 font-mono leading-relaxed text-ink outline-none"
    />
  );
}

function EncodingChoices({
  encoding,
  onEncoding,
}: {
  encoding: string;
  onEncoding: (encoding: string) => void;
}) {
  return (
    <>
      <MenuLabel>Read as</MenuLabel>
      {ENCODINGS.map(([value, label]) => (
        <MenuChoice key={value} checked={encoding === value} onSelect={() => onEncoding(value)}>
          {label}
        </MenuChoice>
      ))}
    </>
  );
}
