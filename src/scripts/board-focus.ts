/**
 * Keeps keyboard focus on the /orders kitchen board across a re-render. The board is rebuilt
 * from scratch whenever the order list changes, so the focused card's element is thrown away;
 * capture notes where focus was, restore puts it back.
 *
 * - The same order still on the board: focus it again, in its new column if it moved. A card in
 *   "done" is not a button, so focus goes to its Archive button.
 * - The order left the board (archived, or cleared elsewhere): focus the card that took its slot
 *   in the column it sat in, else the one before it, else that column's heading — never <body>.
 */

export interface BoardFocus {
  id: string;
  /** The data-column the card sat in, and its position there. */
  column: string | undefined;
  index: number;
}

export function captureBoardFocus(doc: Document): BoardFocus | null {
  const card = doc.activeElement?.closest<HTMLElement>('[data-order-id]');
  const id = card?.dataset.orderId;
  if (!card || !id) return null;
  const column = card.closest<HTMLElement>('[data-column]');
  return {
    id,
    column: column?.dataset.column,
    index: column ? Array.from(column.children).indexOf(card) : -1,
  };
}

// A card's own focus target: the card when it is a button (new, making), else its first button
// (a done card's Archive).
const focusTarget = (card: Element | null | undefined): HTMLElement | null =>
  card?.tagName === 'BUTTON' ? (card as HTMLElement) : (card?.querySelector<HTMLElement>('button') ?? null);

// Matched on dataset rather than a built selector, so no id ever needs escaping.
const byData = (doc: Document, attr: 'orderId' | 'column', value: string) =>
  Array.from(doc.querySelectorAll<HTMLElement>(attr === 'orderId' ? '[data-order-id]' : '[data-column]')).find(
    (el) => el.dataset[attr] === value
  );

export function restoreBoardFocus(doc: Document, saved: BoardFocus | null): void {
  if (!saved) return;

  const same = focusTarget(byData(doc, 'orderId', saved.id));
  if (same) {
    same.focus();
    return;
  }

  if (!saved.column) return;
  const column = byData(doc, 'column', saved.column);
  const cards = column ? Array.from(column.children) : [];
  const neighbour = focusTarget(cards[saved.index] ?? cards[saved.index - 1]);
  if (neighbour) {
    neighbour.focus();
    return;
  }

  // An emptied column: its heading (tabindex="-1" in orders.astro, so it takes focus).
  doc.getElementById(`col-${saved.column}`)?.focus();
}
