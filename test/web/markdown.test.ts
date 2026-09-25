import { describe, expect, it } from 'vitest';

import { renderMarkdown } from '@/features/preview/viewers/markdown';

describe('renderMarkdown', () => {
  it('renders ordinary markdown', () => {
    expect(renderMarkdown('# Title\n\n**bold**')).toContain('<strong>bold</strong>');
  });

  it('shows raw HTML as text instead of executing it', () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">\n\n<script>alert(1)</script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });

  it('drops script URLs from links but keeps their text', () => {
    const html = renderMarkdown('[click](javascript:alert(1)) and [site](https://example.com)');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click');
    expect(html).toContain('href="https://example.com"');
  });

  it('does not fetch remote images', () => {
    expect(renderMarkdown('![tracker](https://example.com/pixel.gif)')).not.toContain('<img');
  });
});
