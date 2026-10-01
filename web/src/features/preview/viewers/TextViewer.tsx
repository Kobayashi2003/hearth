import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AArrowDown, AArrowUp, Languages, Pencil, Save, WrapText, X } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useRemembered } from '@/lib/storage';
import { useSession } from '@/features/session/session';
import { percentOf, useProgress } from '@/features/progress/progress';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { Menu, MenuChoice, MenuLabel } from '@/ui/Menu';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';
import { useHighlighted } from './highlight';
import { renderMarkdown } from './markdown';

const ENCODINGS: ReadonlyArray<[string, string]> = [
  ['utf8', 'UTF-8'],
  ['gb18030', 'GB18030 (Simplified Chinese)'],
  ['big5', 'Big5 (Traditional Chinese)'],
  ['shift_jis', 'Shift_JIS (Japanese)'],
  ['euc-kr', 'EUC-KR (Korean)'],
  ['utf16le', 'UTF-16 LE'],
  ['win1252', 'Windows-1252'],
];
const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 22];

export default function TextViewer({ entry }: ViewerProps) {
  const path = entry.path;
  const { can } = useSession();
  const { progressFor, save } = useProgress();
  const [encoding, setEncoding] = useState<string | undefined>(undefined);
  const [wrap, setWrap] = useRemembered<boolean>('text.wrap', true);
  const [fontSize, setFontSize] = useRemembered<number>('text.size', 14);
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['content', path, encoding],
    queryFn: () => api.readText(path, encoding),
  });

  const isMarkdown = /\.(md|markdown)$/i.test(entry.name);
  const markdown = useMemo(
    () => (isMarkdown && data ? renderMarkdown(data.content) : null),
    [isMarkdown, data],
  );
  const highlighted = useHighlighted(
    !isMarkdown && draft === null ? (data?.content ?? '') : '',
    entry.name,
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const restored = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !data || restored.current) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) return;
    restored.current = true;
    const saved = progressFor(path);
    const fraction = saved?.kind === 'locator' ? Number(saved.at) : Number.NaN;
    if (fraction > 0) element.scrollTop = fraction * scrollable;
  }, [data, highlighted, markdown, path, progressFor]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const rememberScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element || !restored.current) return;
    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) return;
    const fraction = Math.min(1, element.scrollTop / scrollable);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(
      () =>
        save(path, {
          kind: 'locator',
          at: fraction.toFixed(4),
          percent: percentOf(fraction, 1),
          savedAt: Date.now(),
        }),
      600,
    );
  }, [path, save]);

  const commit = useCallback(async () => {
    if (draft === null) return;
    setSaving(true);
    try {
      await api.writeText(path, draft, data?.encoding);
      toast.success('Saved');
      setDraft(null);
      await refetch();
    } catch (caught) {
      toast.error('Could not save', {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }, [path, draft, data?.encoding, refetch]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && draft !== null) {
        event.preventDefault();
        void commit();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draft, commit]);

  const step = (delta: 1 | -1) => {
    const index = FONT_SIZES.indexOf(fontSize);
    setFontSize(
      FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, (index < 0 ? 2 : index) + delta))]!,
    );
  };
  const stepRef = useRef(step);
  stepRef.current = step;

  // Ctrl + wheel (and a trackpad pinch) sizes the text, as it would a page in the browser.
  useEffect(() => {
    let travel = 0;
    function onWheel(event: WheelEvent) {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      travel += event.deltaY;
      if (Math.abs(travel) < 40) return;
      stepRef.current(travel < 0 ? 1 : -1);
      travel = 0;
    }
    const element = scrollRef.current;
    element?.addEventListener('wheel', onWheel, { passive: false });
    return () => element?.removeEventListener('wheel', onWheel);
  });

  const actions =
    draft !== null ? (
      <>
        <Button variant="quiet" size="sm" onClick={() => setDraft(null)}>
          <X /> Discard
        </Button>
        <Button variant="primary" size="sm" onClick={() => void commit()} disabled={isSaving}>
          <Save /> Save
        </Button>
      </>
    ) : (
      <>
        <Button variant="quiet" size="icon" onClick={() => step(-1)} aria-label="Smaller text">
          <AArrowDown />
        </Button>
        <Button variant="quiet" size="icon" onClick={() => step(1)} aria-label="Larger text">
          <AArrowUp />
        </Button>
        <Button
          variant="quiet"
          size="icon"
          onClick={() => setWrap(!wrap)}
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
          <MenuLabel>Read as</MenuLabel>
          {ENCODINGS.map(([value, label]) => (
            <MenuChoice
              key={value}
              checked={(data?.encoding ?? 'utf8') === value}
              onSelect={() => setEncoding(value)}
            >
              {label}
            </MenuChoice>
          ))}
        </Menu>
        {can('write') && data && !data.truncated ? (
          <Button
            variant="quiet"
            size="icon"
            onClick={() => setDraft(data.content)}
            aria-label="Edit"
            title="Edit"
          >
            <Pencil />
          </Button>
        ) : null}
      </>
    );

  return (
    <ViewerFrame entry={entry} actions={actions} tone="paper">
      {isPending ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : error ? (
        <Notice title="This file could not be read" body={error.message} />
      ) : draft !== null ? (
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          spellCheck={false}
          wrap={wrap ? 'soft' : 'off'}
          autoFocus
          aria-label={`Editing ${entry.name}`}
          style={{ fontSize }}
          className="absolute inset-0 resize-none bg-surface p-5 font-mono leading-relaxed text-ink outline-none"
        />
      ) : (
        <div
          ref={scrollRef}
          onScroll={rememberScroll}
          className="scroll-thin absolute inset-0 overflow-auto"
          style={{ fontSize }}
        >
          {data?.truncated ? (
            <p className="sticky top-0 z-10 border-b border-line bg-sunken px-5 py-2 text-[12.5px] text-ink-2">
              Only the beginning of this file is shown; it is too large to load whole. Download it
              to see the rest.
            </p>
          ) : null}
          {markdown ? (
            <article
              className="prose-doc mx-auto max-w-[72ch] px-6 py-8"
              dangerouslySetInnerHTML={{ __html: markdown }}
            />
          ) : highlighted ? (
            <div
              className={cn(
                'shiki-host px-5 py-4',
                wrap ? '[&_pre]:whitespace-pre-wrap [&_pre]:break-words' : '[&_pre]:whitespace-pre',
              )}
              style={{ fontSize }}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <pre
              className={cn(
                'px-5 py-4 font-mono leading-relaxed',
                wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
              )}
            >
              {data?.content}
            </pre>
          )}
        </div>
      )}
    </ViewerFrame>
  );
}
