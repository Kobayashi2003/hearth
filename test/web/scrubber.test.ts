// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Scrubber } from '@/ui/Scrubber';

/** A bar 100px wide at the left edge, so clientX is a percentage. */
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    width: 100,
  } as DOMRect);
  HTMLElement.prototype.setPointerCapture = () => {};
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function scrubber(props: { live?: boolean } = {}) {
  const onChange = vi.fn<(value: number) => void>();
  const onScrub = vi.fn<(scrubbing: boolean) => void>();
  render(
    createElement(Scrubber, { value: 10, max: 200, onChange, onScrub, label: 'Seek', ...props }),
  );
  return { bar: screen.getByRole('slider', { name: 'Seek' }), onChange, onScrub };
}

const at = (clientX: number) => ({ clientX, button: 0, pointerId: 1, pointerType: 'mouse' });

describe('Scrubber', () => {
  it('follows a drag with the time but seeks once, on release', () => {
    const { bar, onChange, onScrub } = scrubber();

    fireEvent.pointerDown(bar, at(20));
    fireEvent.pointerMove(bar, at(40));
    fireEvent.pointerMove(bar, at(50));
    expect(bar.getAttribute('aria-valuetext')).toBe('1:40');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.pointerUp(bar, at(50));
    expect(onChange.mock.calls).toEqual([[100]]);
    expect(onScrub.mock.calls).toEqual([[true], [false]]);
  });

  it('when live, seeks along the drag and once more where the pointer rests', () => {
    const { bar, onChange } = scrubber({ live: true });

    fireEvent.pointerDown(bar, at(20));
    fireEvent.pointerMove(bar, at(30));
    fireEvent.pointerMove(bar, at(60));
    expect(onChange.mock.calls).toEqual([[40]]);

    vi.advanceTimersByTime(200);
    expect(onChange.mock.calls).toEqual([[40], [120]]);
  });

  it('puts the picture back when a drag is taken away', () => {
    const { bar, onChange, onScrub } = scrubber({ live: true });

    fireEvent.pointerDown(bar, at(80));
    fireEvent.pointerCancel(bar, at(80));
    vi.advanceTimersByTime(200);

    expect(onChange.mock.calls).toEqual([[160], [10]]);
    expect(onScrub).toHaveBeenLastCalledWith(false);
  });

  it('steps five seconds with the arrows and jumps with Home and End', () => {
    const { bar, onChange } = scrubber();

    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    fireEvent.keyDown(bar, { key: 'ArrowLeft' });
    fireEvent.keyDown(bar, { key: 'End' });
    fireEvent.keyDown(bar, { key: 'Home' });

    expect(onChange.mock.calls).toEqual([[15], [5], [200], [0]]);
  });
});
