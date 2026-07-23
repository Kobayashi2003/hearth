import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marked } from 'marked';
import { Eye, Pencil, Save, WrapText } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Select, Spinner, Tooltip } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ViewerChrome } from '../ViewerChrome';
import { useHighlighted } from './text/useHighlighted';
import type { ViewerProps } from './types';

/** Encodings worth offering directly; anything iconv knows can be typed in. */
const ENCODINGS = ['utf8', 'utf16le', 'gb18030', 'big5', 'shift_jis', 'euc-kr', 'win1252', 'latin1'];

type Mode = 'read' | 'edit';

export default function TextViewer({ item, onStep, ...chrome }: ViewerProps) {
  const path = item.entry.path;
  const [encoding, setEncoding] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<Mode>('read');
  const [draft, setDraft] = useState('');
  const [wrap, setWrap] = useState(true);
  const [isSaving, setSaving] = useState(false);

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
      controls={
        <div className="flex items-center gap-1">
          <Tooltip label="Text encoding — change it if characters look wrong">
            <Select
              value={data?.encoding ?? 'utf8'}
              onChange={event => setEncoding(event.target.value)}
              aria-label="Text encoding"
              className="h-8 text-xs"
            >
              {ENCODINGS.map(candidate => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </Select>
          </Tooltip>

          <Tooltip label={wrap ? 'Wrap lines: on' : 'Wrap lines: off'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setWrap(current => !current)}
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
          aria-label={`Editing ${item.entry.name}`}
          className={cn(
            'h-full w-full resize-none bg-surface p-4 font-mono text-[0.8125rem] leading-relaxed',
            'text-primary outline-none',
            wrap ? 'whitespace-pre-wrap' : 'overflow-x-auto whitespace-pre',
          )}
        />
      ) : (
        <div className="h-full overflow-auto bg-surface">
          {data?.truncated ? (
            <p className="border-b border-subtle bg-sunken px-4 py-2 text-xs text-muted">
              Showing the first part of this file — it is too large to load whole.
            </p>
          ) : null}

          {html ? (
            <article
              className="prose-hearth mx-auto max-w-3xl px-6 py-6"
              // Markdown is authored by the file's owner and rendered for them alone.
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : highlighted ? (
            <div
              className={cn(
                'shiki-host p-4 text-[0.8125rem] leading-relaxed',
                wrap && '[&_pre]:whitespace-pre-wrap',
              )}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <pre
              className={cn(
                'p-4 font-mono text-[0.8125rem] leading-relaxed text-primary',
                wrap ? 'whitespace-pre-wrap' : 'whitespace-pre',
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
