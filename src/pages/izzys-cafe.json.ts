import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { parseMenu } from '@izzy/cafe-menu';

// Build-time JSON feed of the Izzy's Cafe menu, parsed out of the markdown body of the
// `izzys-cafe` page entry. Consumed by external displays (e.g. the dizzyos LED-matrix sign)
// so they can render the menu without scraping HTML, keeping the markdown as the single
// source of truth. The parser (@izzy/cafe-menu) is shared with the order form and menu editor.
export const GET: APIRoute = async () => {
  const page = await getEntry('pages', 'izzys-cafe');
  if (!page) throw new Error('Missing "izzys-cafe" entry in the pages collection');

  const payload = {
    title: page.data.title,
    sections: parseMenu(page.body ?? ''),
  };

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  });
};
