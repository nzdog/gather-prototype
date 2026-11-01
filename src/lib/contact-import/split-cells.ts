/**
 * [[GTC-448]] — a small quote-aware reader for delimited text (comma or tab), for the paste and
 * file readers. No library: commas, double quotes, `""` for a quote, and line breaks inside quoted
 * cells; CRLF, CR or LF between rows; a leading byte-order mark is dropped.
 *
 * A quote opens a quoted cell only at the start of a cell (leading spaces allowed), so a stray
 * quote in the middle of a cell is just a character.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell.trim() === '') {
      cell = '';
      quoted = true;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function isBlankRow(row: string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}
