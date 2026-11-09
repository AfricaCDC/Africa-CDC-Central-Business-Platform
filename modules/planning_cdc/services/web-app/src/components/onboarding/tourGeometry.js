// Where the spotlight and the popover go (D-20261105-16). Pure functions,
// so they are tested without a browser layout.

const GAP = 12;
const MARGIN = 16;
const POPOVER_WIDTH = 320;
const ROOM_BELOW = 200;

/**
 * The on-screen box of a `data-tour` anchor, or null when it is missing or hidden.
 *
 * @param {string} target - data-tour key
 * @param {Document} [doc]
 * @returns {{ top: number, left: number, width: number, height: number }|null}
 * @example anchorRect('avatar');
 */
export function anchorRect(target, doc = document) {
  const el = target ? doc.querySelector(`[data-tour="${target}"]`) : null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
}

/**
 * Popover position next to the anchor: below when there is room, else
 * above; kept inside the viewport. Null rect = centred.
 *
 * @param {{ top: number, left: number, width: number, height: number }|null} rect
 * @param {{ width: number, height: number }} viewport
 * @returns {{ top: number, left: number, width: number, above: boolean }|null} null = centre it
 * @example popoverPosition({ top: 10, left: 900, width: 40, height: 40 }, { width: 1000, height: 800 });
 */
export function popoverPosition(rect, viewport) {
  if (!rect) return null;
  const width = Math.min(POPOVER_WIDTH, viewport.width - 2 * MARGIN);
  const left = Math.max(MARGIN, Math.min(rect.left, viewport.width - width - MARGIN));
  const below = viewport.height - (rect.top + rect.height) >= ROOM_BELOW;
  return below
    ? { top: rect.top + rect.height + GAP, left, width, above: false }
    : { top: rect.top - GAP, left, width, above: true };
}
