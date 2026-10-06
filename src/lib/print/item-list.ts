/**
 * [[GTC-366]] (item 11) — THE PRINT FOR THE FRIDGE, ONE MODULE FOR BOTH DOORS.
 *
 * From the founder's walk of 2026-10-03, of the old dashboard's printable list: *"It's good."*
 * Ruled 2026-10-06 (Q12): the board prints it in one tap ("Print the list"), and the old
 * dashboard's "Download PDF" prints it through this same module, so there is one print, not two.
 *
 * The page is HEAD's, byte for byte (`tests/walkthrough-batch4-test.tsx` P11d holds it to a frozen
 * copy), with two changes, both ruled:
 *   - EVERY NAME IS ESCAPED — the item, the person, the category and the event, in the body and
 *     the `<title>`. HEAD wrote them raw with `document.write`, so a name was markup.
 *   - THE AMOUNTS READ IN PLAIN WORDS (W17, Q14): "2 trays", "1 big bag", by the reading panel's
 *     own rule (`quantityLabel`), where HEAD printed the raw unit ("2 TRAYS", "1 CUSTOM").
 *
 * ⚠ Q13, ACCEPTED AS STATED: both doors read `GET /api/events/[id]/items`, which sends each row
 * whole, behind-the-scenes fields included. `toPrintItems` keeps only what is printed, the moment
 * the list arrives, and nothing else from it reaches the board's page.
 */

import { quantityLabel } from '@/components/glance/reading';

/** W13 to W16, ruled 2026-10-06 (W16 with the founder's fix). */
export const PRINT_WORDS = {
  DOOR: 'Print the list',
  LOADING: 'Getting the list ready…',
  FAILED: 'That didn’t work. Close this tab and try again from the board.',
  BLOCKED: 'Your browser blocked the print window. Allow pop-ups for Gather, then try again.',
} as const;

/** Exactly what the print shows of an item, and nothing more. */
export interface PrintItem {
  name: string;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  quantityText: string | null;
  team: { name: string; displayOrder: number };
  assignment: { response: string; person: { name: string } | null } | null;
}

/** Text made safe to write into HTML: `< > & " '`. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Q13 — the list as the route sends it, cut down to the printed fields at once. */
export function toPrintItems(raw: unknown[]): PrintItem[] {
  return raw.map((r) => {
    const item = (r ?? {}) as Record<string, any>;
    const a = item.assignment as Record<string, any> | null | undefined;
    return {
      name: str(item.name) ?? '',
      quantityAmount: num(item.quantityAmount),
      quantityUnit: str(item.quantityUnit),
      quantityUnitCustom: str(item.quantityUnitCustom),
      quantityText: str(item.quantityText),
      team: { name: str(item.team?.name) ?? '', displayOrder: num(item.team?.displayOrder) ?? 0 },
      assignment: a
        ? {
            response: str(a.response) ?? 'PENDING',
            person: a.person ? { name: str(a.person.name) ?? '' } : null,
          }
        : null,
    };
  });
}

/** W17 — the amount in plain words; else the host's own text; else "—", as HEAD fell back. */
export function printQuantity(item: PrintItem): string {
  if (item.quantityAmount && item.quantityUnit) {
    const label = quantityLabel({
      quantityAmount: item.quantityAmount,
      quantityUnit: item.quantityUnit,
      quantityUnitCustom: item.quantityUnitCustom,
    });
    if (label) return label;
  }
  return item.quantityText || '—';
}

/** The event's date as the print has always shown it ("25 December 2026"), in NZ time. */
export function printEventDate(startDate: Date | string | null | undefined): string {
  if (!startDate) return '';
  return new Date(startDate).toLocaleDateString('en-NZ', {
    timeZone: 'Pacific/Auckland',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const gatherLogo = `<svg viewBox="0 0 240 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="height:32px;width:auto;"><circle cx="7" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="7" cy="15" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="15" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="15" r="2.5" fill="rgba(107,124,111,0.3)"/><circle cx="31" cy="15" r="2.5" fill="rgba(107,124,111,0.3)"/><circle cx="7" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="7" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="31" r="2.5" fill="#6b7c6f"/><text x="56" y="29" fill="#6b7c6f" style="font-family:'Source Serif 4',Georgia,serif;font-size:28px;font-weight:400;letter-spacing:-0.01em;">Gather</text></svg>`;

/** The printable page: a table per category, in the plan's order. */
export function itemListHtml({
  eventName,
  eventDate,
  items,
}: {
  eventName: string;
  eventDate: string;
  items: PrintItem[];
}): string {
  const grouped = items.reduce<Record<string, PrintItem[]>>((acc, item) => {
    const key = item.team.name;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  const hasOrder = items.some((i) => i.team.displayOrder > 0);
  const cats = Object.keys(grouped).sort((a, b) => {
    if (hasOrder) {
      const oA = grouped[a][0]?.team.displayOrder ?? 0;
      const oB = grouped[b][0]?.team.displayOrder ?? 0;
      if (oA !== oB) return oA - oB;
    }
    return a.localeCompare(b);
  });

  let html = `<!DOCTYPE html><html><head><title>${escapeHtml(eventName)} — Items</title>
                      <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111; }
                        .logo { margin-bottom: 16px; }
                        h1 { font-size: 20px; margin-bottom: 2px; }
                        .date { font-size: 14px; color: #666; margin-bottom: 24px; }
                        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
                        th, td { text-align: left; padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #eee; }
                        th { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
                        .qty { color: #555; }
                        .status-confirmed { color: #16a34a; }
                        .status-declined { color: #dc2626; }
                        .status-pending { color: #d97706; }
                        .status-unassigned { color: #999; font-style: italic; }
                        @media print { body { padding: 0; } .logo svg text { fill: #333; } }
                      </style></head><body>`;
  html += `<div class="logo">${gatherLogo}</div>`;
  html += `<h1>${escapeHtml(eventName)}</h1>`;
  if (eventDate) html += `<div class="date">${escapeHtml(eventDate)}</div>`;

  for (const cat of cats) {
    const catItems = grouped[cat];
    html += `<h2>${escapeHtml(cat)}</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Assigned To</th><th>Status</th></tr></thead><tbody>`;
    for (const item of catItems) {
      const qty = escapeHtml(printQuantity(item));
      const assignee = item.assignment?.person?.name
        ? escapeHtml(item.assignment.person.name)
        : '<span class="status-unassigned">Unassigned</span>';
      const r = item.assignment?.response;
      const status = item.assignment
        ? `<span class="status-${r === 'ACCEPTED' ? 'confirmed' : r === 'DECLINED' ? 'declined' : 'pending'}">${r === 'ACCEPTED' ? 'Confirmed' : r === 'DECLINED' ? 'Declined' : r === 'MAYBE' ? 'Maybe' : 'Pending'}</span>`
        : '';
      html += `<tr><td>${escapeHtml(item.name)}</td><td class="qty">${qty}</td><td>${assignee}</td><td>${status}</td></tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `</body></html>`;
  return html;
}

/** A short page of one line, for while the list loads (W14) or if it fails (W15). */
export function noteHtml(eventName: string, line: string): string {
  return `<!DOCTYPE html><html><head><title>${escapeHtml(eventName)} — Items</title></head><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111;"><p>${escapeHtml(line)}</p></body></html>`;
}

/** The part of a window the print uses — so a test can hand in a stub and no dialog opens. */
export interface PrintWindow {
  document: { open(): unknown; write(html: string): void; close(): void };
  print(): void;
}

/** Write a page into the print window and, for the list itself, open the browser's print. */
export function writePage(win: PrintWindow, html: string, print: boolean): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
  if (print) win.print();
}
