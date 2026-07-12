/** Minimal CSV parser: quoted fields, "" escapes, LF/CRLF, BOM, skips empty lines. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellWasQuoted = false;

  const pushCell = () => {
    row.push(cellWasQuoted ? cell : cell.trim());
    cell = "";
    cellWasQuoted = false;
  };
  const pushRow = () => {
    pushCell();
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

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
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cellWasQuoted = true;
      cell = "";
    } else if (ch === ",") {
      pushCell();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // swallow (CRLF handled by \n)
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || cellWasQuoted || row.length > 0) pushRow();
  return rows;
}
