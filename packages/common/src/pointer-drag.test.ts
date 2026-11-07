// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { enablePointerDrag } from './pointer-drag';

/** jsdom has no PointerEvent constructor; pointer listeners fire on MouseEvent fine. */
const pointer = (type: string, x: number, y: number): MouseEvent =>
  new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 });

const buildBoard = (): { container: HTMLElement; card: HTMLElement; column: HTMLElement } => {
  const container = document.createElement('div');
  container.innerHTML = `
    <section class="col" data-column-id="a"><ul><li class="card" data-good-id="1">A</li></ul></section>
    <section class="col" data-column-id="b"><ul></ul></section>`;
  document.body.appendChild(container);
  return {
    container,
    card: container.querySelector('.card') as HTMLElement,
    column: container.querySelector('[data-column-id="b"]') as HTMLElement,
  };
};

describe('enablePointerDrag', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('drops on the target under the pointer after passing the threshold', () => {
    const { container, card, column } = buildBoard();
    const onDrop = vi.fn();
    // jsdom has no layout, so hit-testing is injected: anything right of x=100
    // "is" column b.
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      elementFromPoint: (x) => (x > 100 ? column : card),
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 60, 10)); // past threshold → ghost
    expect(document.querySelector('.drag-ghost')).not.toBeNull();
    expect(card.classList.contains('drag-source')).toBe(true);

    document.dispatchEvent(pointer('pointermove', 150, 10));
    expect(column.classList.contains('drag-over')).toBe(true);

    document.dispatchEvent(pointer('pointerup', 150, 10));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith(card, column);
    // Everything cleaned up.
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(card.classList.contains('drag-source')).toBe(false);
    expect(column.classList.contains('drag-over')).toBe(false);
  });

  it('suppresses the synthetic card click after a drag', () => {
    const { container, card, column } = buildBoard();
    const onClick = vi.fn();
    card.addEventListener('click', onClick);
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop: vi.fn(),
      elementFromPoint: (x) => (x > 100 ? column : card),
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 60, 10));
    document.dispatchEvent(pointer('pointermove', 150, 10));
    document.dispatchEvent(pointer('pointerup', 150, 10));
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not suppress the next non-card click after a drag', () => {
    const { container, card, column } = buildBoard();
    const toolbarButton = document.createElement('button');
    toolbarButton.type = 'button';
    toolbarButton.textContent = 'Check in';
    container.prepend(toolbarButton);
    const onClick = vi.fn();
    toolbarButton.addEventListener('click', onClick);
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop: vi.fn(),
      elementFromPoint: (x) => (x > 100 ? column : card),
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 60, 10));
    document.dispatchEvent(pointer('pointermove', 150, 10));
    document.dispatchEvent(pointer('pointerup', 150, 10));
    toolbarButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('a press without movement stays a click (no drag, no drop)', () => {
    const { container, card } = buildBoard();
    const onDrop = vi.fn();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      elementFromPoint: () => card,
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 12, 11)); // under threshold
    document.dispatchEvent(pointer('pointerup', 12, 11));

    expect(onDrop).not.toHaveBeenCalled();
    expect(document.querySelector('.drag-ghost')).toBeNull();
  });

  it('does not drop when released outside any target', () => {
    const { container, card } = buildBoard();
    const onDrop = vi.fn();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      elementFromPoint: () => null,
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 80, 10));
    document.dispatchEvent(pointer('pointerup', 80, 10));

    expect(onDrop).not.toHaveBeenCalled();
  });

  it('pointercancel aborts the drag cleanly', () => {
    const { container, card, column } = buildBoard();
    const onDrop = vi.fn();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      elementFromPoint: () => column,
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 80, 10));
    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));

    expect(onDrop).not.toHaveBeenCalled();
    expect(document.querySelector('.drag-ghost')).toBeNull();
    expect(card.classList.contains('drag-source')).toBe(false);
  });

  it('ignores presses on interactive controls inside a card', () => {
    const { container, card } = buildBoard();
    const button = document.createElement('button');
    card.appendChild(button);
    const onDrop = vi.fn();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      elementFromPoint: () => card,
    });

    button.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 80, 10));
    expect(document.querySelector('.drag-ghost')).toBeNull();
    document.dispatchEvent(pointer('pointerup', 80, 10));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('dispose removes the pointerdown hook', () => {
    const { container, card } = buildBoard();
    const onDrop = vi.fn();
    const dispose = enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      elementFromPoint: () => card,
    });
    dispose();

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 80, 10));
    expect(document.querySelector('.drag-ghost')).toBeNull();
  });

  it('canDrop=false suppresses the drag-over affordance and the drop', () => {
    const { container, card, column } = buildBoard();
    const onDrop = vi.fn();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      canDrop: () => false,
      elementFromPoint: (x) => (x > 100 ? column : card),
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 60, 10));
    document.dispatchEvent(pointer('pointermove', 150, 10)); // over column b
    expect(column.classList.contains('drag-over')).toBe(false);

    document.dispatchEvent(pointer('pointerup', 150, 10));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('canDrop is consulted per target and allows valid drops', () => {
    const { container, card, column } = buildBoard();
    const onDrop = vi.fn();
    const canDrop = vi.fn(() => true);
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop,
      canDrop,
      elementFromPoint: (x) => (x > 100 ? column : card),
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 60, 10));
    document.dispatchEvent(pointer('pointermove', 150, 10));
    document.dispatchEvent(pointer('pointerup', 150, 10));

    expect(canDrop).toHaveBeenCalledWith(card, column);
    expect(onDrop).toHaveBeenCalledWith(card, column);
  });

  it('suppresses text selection for the whole drag session', () => {
    const { container, card, column } = buildBoard();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop: vi.fn(),
      elementFromPoint: () => column,
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    // Pre-threshold: the browser would begin selecting — selectstart is blocked.
    const early = new Event('selectstart', { bubbles: true, cancelable: true });
    document.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(true);

    document.dispatchEvent(pointer('pointermove', 80, 10)); // drag starts
    expect(document.body.style.userSelect).toBe('none');

    document.dispatchEvent(pointer('pointerup', 80, 10));
    expect(document.body.style.userSelect).toBe('');
    // Session over: selection works again.
    const after = new Event('selectstart', { bubbles: true, cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('restores selection behavior when the drag is cancelled', () => {
    const { container, card, column } = buildBoard();
    enablePointerDrag(container, {
      itemSelector: '.card',
      targetSelector: '.col',
      onDrop: vi.fn(),
      elementFromPoint: () => column,
    });

    card.dispatchEvent(pointer('pointerdown', 10, 10));
    document.dispatchEvent(pointer('pointermove', 80, 10));
    document.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));

    expect(document.body.style.userSelect).toBe('');
    const after = new Event('selectstart', { bubbles: true, cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
