import { describe, expect, it } from 'vitest';
import { Window as HappyWindow } from 'happy-dom';
import { captureBoardFocus, restoreBoardFocus } from './board-focus';

type Status = 'new' | 'making' | 'done';
type Board = Partial<Record<Status, string[]>>;

// Mirrors orders.astro: new/making cards are buttons; a done card is a div with an Archive button.
function card(doc: Document, id: string, status: Status): HTMLElement {
  if (status === 'done') {
    const el = doc.createElement('div');
    el.dataset.orderId = id;
    const archive = doc.createElement('button');
    archive.textContent = 'Archive';
    el.appendChild(archive);
    return el;
  }
  const el = doc.createElement('button');
  el.dataset.orderId = id;
  return el;
}

function setup(initial: Board) {
  // happy-dom's own types differ from lib.dom's; the module only sees the DOM surface.
  const win = new HappyWindow() as unknown as Window & typeof globalThis;
  const doc = win.document;
  doc.body.innerHTML = (['new', 'making', 'done'] as const)
    .map((s) => `<h2 id="col-${s}">${s}</h2><div data-column="${s}"></div>`)
    .join('');
  // A full rebuild, as render() does: every card element is replaced.
  const render = (board: Board) => {
    for (const s of ['new', 'making', 'done'] as const) {
      doc.querySelector(`[data-column="${s}"]`)!.replaceChildren(...(board[s] ?? []).map((id) => card(doc, id, s)));
    }
  };
  const rerender = (board: Board) => {
    const saved = captureBoardFocus(doc);
    render(board);
    restoreBoardFocus(doc, saved);
  };
  const focusOrder = (id: string, control = false) => {
    const el = doc.querySelector<HTMLElement>(`[data-order-id="${id}"]`)!;
    (control ? el.querySelector<HTMLElement>('button')! : el).focus();
  };
  const active = () => doc.activeElement as HTMLElement;
  render(initial);
  return { doc, rerender, focusOrder, active };
}

describe('board focus across a re-render', () => {
  it('keeps focus on the same order when the board rebuilds unchanged', () => {
    const b = setup({ new: ['1', '2'] });
    b.focusOrder('2');
    b.rerender({ new: ['1', '2'] });
    expect(b.active().dataset.orderId).toBe('2');
  });

  it('follows an order into "done" and lands on its Archive button', () => {
    const b = setup({ making: ['1'] });
    b.focusOrder('1');
    b.rerender({ done: ['1'] });
    expect(b.active().textContent).toBe('Archive');
    expect(b.active().closest<HTMLElement>('[data-order-id]')?.dataset.orderId).toBe('1');
  });

  it('keeps focus on Archive when it was there', () => {
    const b = setup({ done: ['1'] });
    b.focusOrder('1', true);
    b.rerender({ done: ['1'], new: ['2'] });
    expect(b.active().textContent).toBe('Archive');
  });

  it('moves to the card that took the slot when the focused order is archived', () => {
    const b = setup({ done: ['1', '2', '3'] });
    b.focusOrder('2', true);
    b.rerender({ done: ['1', '3'] });
    expect(b.active().closest<HTMLElement>('[data-order-id]')?.dataset.orderId).toBe('3');
  });

  it('falls back to the previous card when the last one leaves', () => {
    const b = setup({ done: ['1', '2'] });
    b.focusOrder('2', true);
    b.rerender({ done: ['1'] });
    expect(b.active().closest<HTMLElement>('[data-order-id]')?.dataset.orderId).toBe('1');
  });

  it("focuses the column heading when the column empties, never <body>", () => {
    const b = setup({ done: ['1'] });
    b.focusOrder('1', true);
    b.rerender({});
    expect(b.active().id).toBe('col-done');
    expect(b.active().tabIndex).toBe(-1);
  });

  it('leaves focus alone when it was not on a card', () => {
    const b = setup({ new: ['1'] });
    const other = b.doc.createElement('button');
    b.doc.body.appendChild(other);
    other.focus();
    b.rerender({ new: ['1', '2'] });
    expect(b.active()).toBe(other);
  });
});
