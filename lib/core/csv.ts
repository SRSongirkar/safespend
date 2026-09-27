// Hand-written RFC 4180-style CSV parser: quoted fields, commas/newlines inside quotes, "" escapes,
// CRLF/LF, BOM, trailing blank lines. Never throws on malformed input.

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  /** 1-based line number (in the file) where each row starts, for error messages */
  lineNumbers: number[];
}

export function parseCsvRows(text: string): { rows: string[][]; lineNumbers: number[] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  const lineNumbers: number[] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;
  let fieldStarted = false;

  const endRow = () => {
    row.push(field);
    // skip completely blank lines
    if (!(row.length === 1 && row[0].trim() === '')) {
      rows.push(row);
      lineNumbers.push(rowStart);
    }
    row = [];
    field = '';
    fieldStarted = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && !fieldStarted) {
      inQuotes = true;
      fieldStarted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
      fieldStarted = false;
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowStart = line;
    } else {
      field += ch;
      fieldStarted = true;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return { rows, lineNumbers };
}

export function parseCsv(text: string): ParsedCsv {
  const { rows, lineNumbers } = parseCsvRows(text);
  if (rows.length === 0) return { header: [], rows: [], lineNumbers: [] };
  return {
    header: rows[0].map((h) => h.trim()),
    rows: rows.slice(1),
    lineNumbers: lineNumbers.slice(1),
  };
}

export function headerSignature(header: string[]): string {
  return header.map((h) => h.trim().toLowerCase()).join('|');
}
