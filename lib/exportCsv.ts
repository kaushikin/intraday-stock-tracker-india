export type CsvRow = Record<string, string | number | boolean | null | undefined>;

function escapeCsvValue(value: CsvRow[string]) {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

export function rowsToCsv(rows: CsvRow[]) {
  if (rows.length === 0) {
    return '';
  }

  const headers = Object.keys(rows[0]);

  const headerLine = headers.map(escapeCsvValue).join(',');

  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvValue(row[header])).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
}

export function downloadCsv(filename: string, rows: CsvRow[]) {
  if (typeof window === 'undefined') {
    return;
  }

  const csv = rowsToCsv(rows);

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
