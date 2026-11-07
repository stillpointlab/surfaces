/// <reference lib="dom" />

/**
 * Pointer-events drag-and-drop between item containers (first used by
 * Context Manager's task board, ADR-0014; moved here with it). Deliberately pointer-based rather than HTML5 DnD:
 * consistent with Context Manager's `resizeManager`, works for touch, and avoids the native
 * ghost-image/styling constraints. Delegated on one persistent container so
 * innerHTML re-renders don't drop listeners.
 *
 * During a drag: the source element gets `drag-source`, a fixed-position
 * clone (`drag-ghost`, pointer-events: none) follows the pointer, and the
 * drop target under the pointer gets `drag-over`.
 */
export interface PointerDragOptions {
  /** Selector for draggable items (resolved via closest() from pointerdown). */
  itemSelector: string;
  /** Selector for drop targets (resolved via closest() from the hover point). */
  targetSelector: string;
  /** Pointer travel (px) before a press becomes a drag; below it, clicks pass through. */
  thresholdPx?: number;
  onDrop: (item: HTMLElement, target: HTMLElement) => void;
  /**
   * Optional predicate for whether `item` may drop on `target`. When it returns
   * false the target is treated as no target: no `drag-over` affordance and no
   * `onDrop` (e.g. a folder cannot move into its own descendant).
   */
  canDrop?: (item: HTMLElement, target: HTMLElement) => boolean;
  /** Injectable hit-testing for tests (jsdom has no layout). */
  elementFromPoint?: (x: number, y: number) => Element | null;
}

interface DragSession {
  item: HTMLElement;
  startX: number;
  startY: number;
  pointerId: number;
  ghost: HTMLElement | null;
  target: HTMLElement | null;
}

/** Enable dragging within `container`. Returns a dispose function. */
export function enablePointerDrag(container: HTMLElement, options: PointerDragOptions): () => void {
  const threshold = options.thresholdPx ?? 5;
  const hitTest =
    options.elementFromPoint ?? ((x: number, y: number) => document.elementFromPoint(x, y));
  let session: DragSession | null = null;

  const findTarget = (x: number, y: number): HTMLElement | null => {
    const hovered = hitTest(x, y);
    const target = (hovered?.closest(options.targetSelector) as HTMLElement | null) ?? null;
    if (target && session && options.canDrop && !options.canDrop(session.item, target)) {
      return null;
    }
    return target;
  };

  // Native text selection fights the drag: suppress it for the whole session
  // (selectstart covers the pre-threshold window) and drop any live selection
  // once an actual drag starts.
  const onSelectStart = (e: Event): void => {
    e.preventDefault();
  };

  const startGhost = (item: HTMLElement, x: number, y: number): HTMLElement => {
    const rect = item.getBoundingClientRect();
    const ghost = item.cloneNode(true) as HTMLElement;
    ghost.classList.add('drag-ghost');
    ghost.style.position = 'fixed';
    ghost.style.width = `${rect.width || 200}px`;
    ghost.style.left = `${x + 8}px`;
    ghost.style.top = `${y + 8}px`;
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '1000';
    document.body.appendChild(ghost);
    item.classList.add('drag-source');
    container.classList.add('dragging');
    document.getSelection()?.removeAllRanges();
    document.body.style.userSelect = 'none';
    return ghost;
  };

  const setTarget = (next: HTMLElement | null): void => {
    if (!session || session.target === next) return;
    session.target?.classList.remove('drag-over');
    next?.classList.add('drag-over');
    session.target = next;
  };

  const cleanup = (): void => {
    if (!session) return;
    session.ghost?.remove();
    session.item.classList.remove('drag-source');
    session.target?.classList.remove('drag-over');
    container.classList.remove('dragging');
    document.body.style.userSelect = '';
    session = null;
    document.removeEventListener('selectstart', onSelectStart);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerCancel);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!session || (e.pointerId ?? 0) !== session.pointerId) return;
    if (!session.ghost) {
      const travel = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
      if (travel < threshold) return;
      session.ghost = startGhost(session.item, e.clientX, e.clientY);
    }
    session.ghost.style.left = `${e.clientX + 8}px`;
    session.ghost.style.top = `${e.clientY + 8}px`;
    setTarget(findTarget(e.clientX, e.clientY));
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!session || (e.pointerId ?? 0) !== session.pointerId) return;
    const dragged = session.ghost !== null;
    const { item, target } = session;
    cleanup();
    if (dragged) {
      // Browsers fire a click after pointerup; swallow it so a drop doesn't
      // also select (or double-click-open) the dragged card.
      container.addEventListener(
        'click',
        (clickEvent) => {
          const clickedItem = (clickEvent.target as HTMLElement).closest(options.itemSelector);
          if (!clickedItem || !container.contains(clickedItem)) return;
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
        },
        { capture: true, once: true }
      );
      if (target) options.onDrop(item, target);
    }
  };

  const onPointerCancel = (e: PointerEvent): void => {
    if (!session || (e.pointerId ?? 0) !== session.pointerId) return;
    cleanup();
  };

  const onPointerDown = (e: Event): void => {
    const pointer = e as PointerEvent;
    // Primary button/touch only; ignore presses on interactive controls so
    // buttons inside a card still click normally.
    if (pointer.button !== undefined && pointer.button !== 0) return;
    const interactive = (pointer.target as HTMLElement).closest('button, a, input, select');
    if (interactive) return;
    const item = (pointer.target as HTMLElement).closest(options.itemSelector);
    if (!item || !container.contains(item)) return;

    session = {
      item: item as HTMLElement,
      startX: pointer.clientX,
      startY: pointer.clientY,
      pointerId: pointer.pointerId ?? 0,
      ghost: null,
      target: null,
    };
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
  };

  container.addEventListener('pointerdown', onPointerDown);
  return () => {
    cleanup();
    container.removeEventListener('pointerdown', onPointerDown);
  };
}
