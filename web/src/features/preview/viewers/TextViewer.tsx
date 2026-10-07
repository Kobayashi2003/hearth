import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { useRemembered } from '@/lib/storage';
import { useSession } from '@/features/session/session';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../overlay';
import { useHighlighted } from './highlight';
import { renderMarkdown } from './markdown';
import { useFontSize, useScrollPlace, useTextEdit } from './text/hooks';
import { EditActions, Editor, ReadActions, TextBody, TruncatedNote } from './text/parts';

export default function TextViewer({ entry }: ViewerProps) {
  const path = entry.path;
  const { can } = useSession();
  const [encoding, setEncoding] = useState<string | undefined>(undefined);
  const [wrap, setWrap] = useRemembered<boolean>('text.wrap', true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { fontSize, step } = useFontSize(scrollRef);

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['content', path, encoding],
    queryFn: () => api.readText(path, encoding),
  });
  const edit = useTextEdit(path, data?.encoding, refetch);
  const editing = edit.draft !== null;

  const isMarkdown = /\.(md|markdown)$/i.test(entry.name);
  const markdown = useMemo(
    () => (isMarkdown && data ? renderMarkdown(data.content) : null),
    [isMarkdown, data],
  );
  const highlighted = useHighlighted(
    !isMarkdown && !editing ? (data?.content ?? '') : '',
    entry.name,
  );
  const rememberScroll = useScrollPlace(scrollRef, path, [data, highlighted, markdown]);

  const editable = can('write') && data && !data.truncated ? data : null;
  const actions = editing ? (
    <EditActions
      isSaving={edit.isSaving}
      onDiscard={() => edit.setDraft(null)}
      onSave={() => void edit.commit()}
    />
  ) : (
    <ReadActions
      wrap={wrap}
      encoding={data?.encoding ?? 'utf8'}
      onStep={step}
      onWrap={setWrap}
      onEncoding={setEncoding}
      onEdit={editable ? () => edit.setDraft(editable.content) : null}
    />
  );

  return (
    <ViewerFrame entry={entry} actions={actions} tone="paper">
      {isPending ? (
        <Centered>
          <Spinner />
        </Centered>
      ) : error ? (
        <Notice title="This file could not be read" body={error.message} />
      ) : edit.draft !== null ? (
        <Editor
          name={entry.name}
          draft={edit.draft}
          wrap={wrap}
          fontSize={fontSize}
          onChange={edit.setDraft}
        />
      ) : (
        <div
          ref={scrollRef}
          onScroll={rememberScroll}
          className="scroll-thin absolute inset-0 overflow-auto"
          style={{ fontSize }}
        >
          {data.truncated ? <TruncatedNote /> : null}
          <TextBody
            content={data.content}
            markdown={markdown}
            highlighted={highlighted}
            wrap={wrap}
            fontSize={fontSize}
          />
        </div>
      )}
    </ViewerFrame>
  );
}
