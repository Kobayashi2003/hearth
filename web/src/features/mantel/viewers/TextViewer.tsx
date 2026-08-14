import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marked } from 'marked';
import { Eye, Pencil, Save, WrapText } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Spinner, Tooltip } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useLedger } from '@/features/ledger/useLedger';
import { ViewerChrome } from '../ViewerChrome';
import { useHighlighted } from './text/useHighlighted';
import { TextSettings } from './text/TextSettings';
import { MEASURE_CLASS, TYPEFACE_CLASS, useReadingStyle } from './text/useReadingStyle';
import type { ViewerProps } from './types';

/** Encodings worth offering directly; anything iconv knows can be typed in. */
const ENCODINGS = ['utf8', 'utf16le', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'win1252', 'latin1'];

const WRAP_PREFERENCE_KEY = 'hearth.text-wrap';

/** The size text is read at when the scale is 1 — 14px, not the 13px of a list. */
const BASE_TEXT_REM = 0.875;

/** A scroll position is written at most this often, however fast you scroll. */
const SAVE_AFTER_IDLE_MS = 600;

type Mode = 'read' | 'edit';

export default function TextViewer({ item, onStep, ...chrome }: ViewerProps) {
  const path = item.entry.path;
  const [encoding, setEncoding] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('read');
  const [draft, setDraft] = useState('');
  // One wrap setting for both reading and editing, remembered across files.
  const [wrap, setWrap] = useState(() => localStorage.getItem(WRAP_PREFERENCE_KEY) !== 'off');
  const [isSaving, setSaving] = useState(false);

  const toggleWrap = useCallback(() => {
    setWrap(current => {
      const next = !current;
      localStorage.setItem(WRAP_PREFERENCE_KEY, next ? 'on' : 'off');
      return next;
    });
  }, []);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['content', path, encoding],
    queryFn: () => api.readText(path, encoding),
  });

  useEffect(() => {
    if (data) setDraft(data.content);
  }, [data]);

  const isMarkdown = /\.(md|markdown)$/i.test(item.entry.name);
  const html = useMemo(
    () => (isMarkdown && data ? marked.parse(data.content, { async: false }) : null),
    [isMarkdown, data],
  );
  const highlighted = useHighlighted(
    !isMarkdown && mode === 'read' ? (data?.content ?? '') : '',
    item.entry.name,
  );

  const { style, update } = useReadingStyle();

  /**
   * Where you had got to.
   *
   * A long text file is read over several sittings, so it belongs in Ledger like
   * any other reading position. It is stored as a fraction of the scroll height
   * rather than a line or an offset: nothing else survives a change of text size,
   * of window width, or of the wrap setting, all of which reflow the whole file.
   */
  const { progressFor, saveProgress, markOpened } = useLedger();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** The path whose position has been applied, so it is only applied once. */
  const restored = useRef<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    restored.current = null;
    markOpened(path);
  }, [markOpened, path]);

  // Runs again as the content lands — highlighting arrives a beat after the text,
  // and a fraction of a page that has not been laid out yet is meaningless.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !data || restored.current === path) return;

    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) return;

    restored.current = path;
    const saved = progressFor(path);
    const fraction = saved?.kind === 'locator' ? Number(saved.at) : Number.NaN;
    if (Number.isFinite(fraction) && fraction > 0) element.scrollTop = fraction * scrollable;
  }, [data, highlighted, html, path, progressFor]);

  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const rememberPosition = useCallback(() => {
    const element = scrollRef.current;
    if (!element || restored.current !== path) return;

    const scrollable = element.scrollHeight - element.clientHeight;
    if (scrollable <= 0) return;
    const fraction = Math.min(1, Math.max(0, element.scrollTop / scrollable));

    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveProgress(path, {
        kind: 'locator',
        at: fraction.toFixed(4),
        percent: Math.round(fraction * 100),
        savedAt: Date.now(),
      });
    }, SAVE_AFTER_IDLE_MS);
  }, [path, saveProgress]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.writeText(path, draft, data?.encoding);
      toast.success('Saved');
      setMode('read');
      await refetch();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }, [path, draft, data?.encoding, refetch]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 's' && mode === 'edit') {
        event.preventDefault();
        void save();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, save]);

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      contentClassName="group/viewer"
      flow="document"
      controls={
        <div className="flex items-center gap-1">
          <TextSettings
            style={style}
            onChange={update}
            encoding={data?.encoding ?? 'utf8'}
            encodings={ENCODINGS}
            onEncoding={setEncoding}
          />

          <Tooltip label={wrap ? 'Wrap lines: on' : 'Wrap lines: off'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleWrap}
              aria-pressed={wrap}
              aria-label="Wrap lines"
              className={cn(wrap && 'text-accent')}
            >
              <WrapText className="h-4 w-4" />
            </Button>
          </Tooltip>

          {mode === 'read' ? (
            <Tooltip label="Edit this file">
              <Button variant="ghost" size="icon" onClick={() => setMode('edit')} aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </Button>
            </Tooltip>
          ) : (
            <>
              <Tooltip label="Discard changes">
                <Button variant="ghost" size="icon" onClick={() => setMode('read')} aria-label="Stop editing">
                  <Eye className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Button variant="primary" size="sm" onClick={() => void save()} disabled={isSaving}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
            </>
          )}
        </div>
      }
      {...chrome}
    >
      {isPending ? (
        <div className="flex h-full items-center justify-center">
          <Spinner className="h-6 w-6" />
        </div>
      ) : error ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
          {error instanceof Error ? error.message : 'Could not read this file'}
        </div>
      ) : mode === 'edit' ? (
        <textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          spellCheck={false}
          // The `wrap` attribute — not just CSS — is what actually stops a
          // textarea soft-wrapping, so it must track the toggle for editing to
          // match the read view. `off` also enables native horizontal scroll.
          wrap={wrap ? 'soft' : 'off'}
          aria-label={`Editing ${item.entry.name}`}
          className={cn(
            'h-full w-full resize-none bg-surface p-4 font-mono text-[0.8125rem] leading-relaxed',
            'text-primary outline-none',
            wrap ? 'whitespace-pre-wrap break-words' : 'overflow-auto whitespace-pre',
          )}
        />
      ) : (
        <div
          ref={scrollRef}
          onScroll={rememberPosition}
          className="h-full overflow-auto bg-surface"
          // Size and spacing are set here and inherited, so one setting reaches
          // the markdown, the highlighted code and the plain pre alike.
          style={{ fontSize: `${BASE_TEXT_REM * style.scale}rem`, lineHeight: style.lineHeight }}
        >
          {data?.truncated ? (
            <p className="sticky top-0 z-10 border-b border-subtle bg-sunken px-4 py-2 text-xs text-muted">
              Showing the first part of this file — it is too large to load whole.
            </p>
          ) : null}

          {html ? (
            <article
              className={cn('prose-hearth px-6 py-6', MEASURE_CLASS[style.measure])}
              // Markdown is authored by the file's owner and rendered for them alone.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : highlighted ? (
            // Code keeps its monospace whatever the typeface says — the typeface
            // is for prose, and alignment is part of what code means.
            //
            // The wrap toggle drives the read view too. Off leaves the pre at
            // white-space: pre so long lines overflow and the container scrolls
            // horizontally; on wraps and breaks so nothing runs off-screen.
            <div
              className={cn(
                'shiki-host p-4',
                wrap
                  ? '[&_pre]:whitespace-pre-wrap [&_pre]:break-words'
                  : '[&_pre]:whitespace-pre',
              )}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <pre
              className={cn(
                'px-4 py-4 text-primary',
                TYPEFACE_CLASS[style.typeface],
                MEASURE_CLASS[style.measure],
                wrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre',
              )}
            >
              {data?.content}
            </pre>
          )}
        </div>
      )}
    </ViewerChrome>
  );
}
