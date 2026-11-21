import { istDateKey } from './marketHours';
export const NIFTY50_SOURCE =
  'https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv';
export type NiftyMember = {
  symbol: string;
  name: string;
  sector: string;
  isin: string;
};
export type NiftyUniverse = {
  members: NiftyMember[];
  source: string;
  checkedAt: string;
  asOf: string;
};
export function parseNifty50CSV(text: string): NiftyMember[] {
  if (typeof text !== 'string' || text.length > 100_000)
    throw new Error('Invalid Nifty 50 constituent file.');
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(field.trim());
      field = '';
    } else if (c === '\n' && !quoted) {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (quoted) throw new Error('Unclosed quote in Nifty 50 file.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map((s) => s.replace(/^\uFEFF/, '')) || [];
  const columns = [
    'Company Name',
    'Industry',
    'Symbol',
    'Series',
    'ISIN Code',
  ].map((k) => header.indexOf(k));
  if (columns.some((i) => i < 0) || rows.length !== 50)
    throw new Error(
      'Expected the official 50-member NSE constituent file. Scan stopped; no static fallback used.'
    );
  const seen = new Set<string>();
  return rows
    .map((r) => {
      const [name, sector, symbol, series, isin] = columns.map((i) => r[i]);
      if (
        !name ||
        !sector ||
        !symbol ||
        !/^[A-Z0-9][A-Z0-9&.-]{0,29}$/.test(symbol) ||
        series !== 'EQ' ||
        !/^INE[A-Z0-9]{9}$/.test(isin || '') ||
        seen.has(symbol)
      )
        throw new Error(
          'Nifty 50 constituent records are incomplete or duplicated.'
        );
      seen.add(symbol);
      return { name, sector, symbol, isin };
    })
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
}
let cached: NiftyUniverse | undefined;
let pending: Promise<NiftyUniverse> | undefined;
export async function getNifty50Universe(): Promise<NiftyUniverse> {
  const today = istDateKey();
  if (cached?.asOf === today) return cached;
  if (pending) return pending;
  pending = (async () => {
    let lastError: unknown;
    for (const source of [
      NIFTY50_SOURCE,
      'https://archives.nseindia.com/content/indices/ind_nifty50list.csv',
    ]) {
      try {
        const response = await fetch(source, {
          cache: 'no-store',
          headers: {
            'User-Agent': 'Mozilla/5.0',
            Accept: 'text/csv,*/*',
            Referer: 'https://www.niftyindices.com/',
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok)
          throw new Error(
            `Official Nifty 50 membership unavailable (HTTP ${response.status}).`
          );
        const members = parseNifty50CSV(await response.text());
        const now = new Date();
        cached = {
          members,
          source,
          checkedAt: now.toISOString(),
          asOf: istDateKey(now),
        };
        return cached;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}
