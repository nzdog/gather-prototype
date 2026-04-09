/**
 * VCF (vCard) import support.
 *
 * Wraps the `vcard-parser` package to produce the same
 * { name, email, phone } shape used by the CSV import pipeline.
 *
 * Handles:
 *  - vCard 3.0 and 4.0
 *  - Multi-contact files (splits on BEGIN:VCARD/END:VCARD)
 *  - Line folding (delegated to vcard-parser)
 *  - Quoted-printable decoding (for vCard 3.0 exports with non-ASCII names,
 *    e.g. Māori macron characters from Outlook/older clients)
 *  - Multi-value EMAIL/TEL fields — PREF type wins, else first-listed
 *  - Skips contacts with neither email nor phone
 */

// Minimal local type shim — vcard-parser ships no types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vcardParser = require('vcard-parser') as {
  parse: (input: string) => Record<string, VCardField[]>;
};

interface VCardField {
  value: string | string[];
  meta?: Record<string, string[]>;
  namespace?: string;
}

export interface VCFContact {
  name: string;
  email: string | null;
  phone: string | null;
}

export interface VCFParseResult {
  contacts: VCFContact[];
  skippedCount: number;
  totalFound: number;
}

/**
 * Split a multi-vCard file into individual vCard blocks.
 * vcard-parser's `parse` treats the entire input as one card and merges
 * all fields into arrays, so we split first and parse each block separately.
 */
function splitVCards(text: string): string[] {
  const blocks: string[] = [];
  const lines = text.split(/\r\n|\r|\n/);
  let current: string[] = [];
  let inside = false;

  for (const line of lines) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      inside = true;
      current = [line];
    } else if (upper === 'END:VCARD') {
      if (inside) {
        current.push(line);
        blocks.push(current.join('\n'));
      }
      inside = false;
      current = [];
    } else if (inside) {
      current.push(line);
    }
  }

  return blocks;
}

/**
 * Decode a quoted-printable encoded string. Handles `=XX` hex octets and
 * soft line breaks (`=\n`). Interprets decoded bytes as UTF-8 by default.
 */
function decodeQuotedPrintable(input: string, charset: string = 'UTF-8'): string {
  // Remove soft line breaks first
  const collapsed = input.replace(/=(\r\n|\n|\r)/g, '');

  // Collect bytes
  const bytes: number[] = [];
  for (let i = 0; i < collapsed.length; i++) {
    const ch = collapsed[i];
    if (ch === '=' && i + 2 < collapsed.length) {
      const hex = collapsed.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    // Plain ASCII character
    bytes.push(collapsed.charCodeAt(i) & 0xff);
  }

  try {
    const decoder = new TextDecoder(charset.toLowerCase());
    return decoder.decode(new Uint8Array(bytes));
  } catch {
    // Fallback: treat as UTF-8
    try {
      return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
    } catch {
      return input;
    }
  }
}

/**
 * Decode a single field value if it carries a QUOTED-PRINTABLE encoding flag.
 * Handles both string values and semicolon-split array values (e.g. N field).
 */
function maybeDecodeField(field: VCardField): VCardField {
  const encoding = field.meta?.encoding?.[0]?.toUpperCase();
  if (encoding !== 'QUOTED-PRINTABLE') return field;

  const charset = field.meta?.charset?.[0] || 'UTF-8';

  if (Array.isArray(field.value)) {
    return {
      ...field,
      value: field.value.map((v) => decodeQuotedPrintable(v, charset)),
    };
  }
  return {
    ...field,
    value: decodeQuotedPrintable(field.value, charset),
  };
}

/**
 * Extract the best display name from a parsed vCard.
 * Prefers FN (formatted name); falls back to assembling N
 * (family;given;middle;prefix;suffix) as "Given Family".
 */
function extractName(card: Record<string, VCardField[]>): string {
  const fn = card.fn?.[0];
  if (fn) {
    const decoded = maybeDecodeField(fn);
    const value = Array.isArray(decoded.value) ? decoded.value.join(' ') : decoded.value;
    if (value.trim()) return value.trim();
  }

  const n = card.n?.[0];
  if (n) {
    const decoded = maybeDecodeField(n);
    const parts = Array.isArray(decoded.value) ? decoded.value : [decoded.value];
    // N is: family; given; additional; prefix; suffix
    const [family = '', given = '', middle = ''] = parts;
    const assembled = [given, middle, family]
      .map((p) => (p || '').trim())
      .filter(Boolean)
      .join(' ');
    if (assembled) return assembled;
  }

  return '';
}

/**
 * From a list of multi-value fields (e.g. all EMAIL or all TEL entries),
 * pick the one with TYPE=PREF, otherwise the first-listed.
 */
function pickPreferred(fields: VCardField[] | undefined): VCardField | null {
  if (!fields || fields.length === 0) return null;

  const preferred = fields.find((f) => {
    // vCard 3.0 allows comma-joined TYPE values (e.g. TYPE=HOME,PREF) which
    // vcard-parser stores as a single string "HOME,PREF" — split on comma.
    // vCard 4.0 uses a separate PREF= parameter; check that too.
    const types = f.meta?.type;
    if (types) {
      const hasPref = types.some((t) =>
        t.split(',').some((token) => token.trim().toUpperCase() === 'PREF')
      );
      if (hasPref) return true;
    }
    // vCard 4.0: PREF=1 (lower is higher priority) signals preference
    const prefParam = f.meta?.pref;
    if (prefParam && prefParam.length > 0) return true;
    return false;
  });

  return preferred || fields[0];
}

function fieldValueToString(field: VCardField): string {
  const decoded = maybeDecodeField(field);
  if (Array.isArray(decoded.value)) {
    // EMAIL and TEL values should be scalars, but defend against arrays
    return decoded.value.filter(Boolean).join('').trim();
  }
  return decoded.value.trim();
}

/**
 * Normalise a phone number using the same rules as CSV import.
 * NZ numbers: strip spaces, ensure +64 prefix if leading 0 is present.
 * International or unrecognised: store as-is (trimmed) — per ticket,
 * do not hard-fail on unknown formats.
 */
function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Strip spaces, dashes, parentheses
  const cleaned = trimmed.replace(/[\s\-()]/g, '');

  // Leading 0 → assume NZ, convert to +64
  if (/^0\d+$/.test(cleaned)) {
    return '+64' + cleaned.slice(1);
  }

  return cleaned;
}

/**
 * Parse a raw VCF file (one or more vCards) into normalised contacts.
 */
export function parseVCF(text: string): VCFParseResult {
  const blocks = splitVCards(text);
  const contacts: VCFContact[] = [];
  let skippedCount = 0;

  for (const block of blocks) {
    let card: Record<string, VCardField[]>;
    try {
      card = vcardParser.parse(block);
    } catch {
      skippedCount++;
      continue;
    }

    const name = extractName(card);

    const emailField = pickPreferred(card.email);
    const telField = pickPreferred(card.tel);

    const email = emailField ? fieldValueToString(emailField).toLowerCase() || null : null;
    const rawPhone = telField ? fieldValueToString(telField) : '';
    const phone = rawPhone ? normalisePhone(rawPhone) || null : null;

    // Skip contacts with no email AND no phone (useless for Gather)
    if (!email && !phone) {
      skippedCount++;
      continue;
    }

    // Skip contacts with no name at all
    if (!name) {
      skippedCount++;
      continue;
    }

    contacts.push({ name, email, phone });
  }

  return {
    contacts,
    skippedCount,
    totalFound: blocks.length,
  };
}
