// 외부 라이브러리 없이 엑셀(.xlsx) 파일을 만듭니다. 숫자는 숫자로(천 단위 쉼표), 글자는 글자로 저장되고 제목 줄은 굵게·고정됩니다.
// 글자 셀은 "문자열"로만 저장되므로 =, +, @ 로 시작해도 수식으로 실행되지 않습니다. (CSV 와 달리 수식 주입 위험이 없음)
import { buildZip } from "./zip.js";

const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);

// XML 에서 허용되지 않는 제어문자를 지우고 특수문자를 이스케이프
const esc = (v) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function columnLetter(index) { // 0 → A, 25 → Z, 26 → AA
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// 시트 이름: 31자 이내, 금지 문자([]:*?/\) 제거, 중복 방지
function sheetName(name, used) {
  let base = String(name || "Sheet").replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet";
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) out = `${base.slice(0, 28)} ${i++}`;
  used.add(out.toLowerCase());
  return out;
}

const STYLE = { default: 0, header: 1, number: 2, boldNumber: 3, bold: 4 };

// sheets: [{ name, columns: [{ header, width?, type?: "text" | "number" }], rows: [[값, ...]], totalRow?: [값, ...] }]
export function buildXlsx(sheets) {
  const used = new Set();
  const names = sheets.map((s) => sheetName(s.name, used));

  const sheetXml = sheets.map((sh) => {
    const cell = (value, col, rowNo, style, type) => {
      const ref = `${columnLetter(col)}${rowNo}`;
      if (value === null || value === undefined || value === "") return `<c r="${ref}" s="${style}"/>`;
      if (type === "number" && Number.isFinite(Number(value))) return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
      return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
    };
    const rowXml = (rowNo, values, styleFor) =>
      `<row r="${rowNo}">${values.map((v, c) => cell(v, c, rowNo, styleFor(c), sh.columns[c]?.type)).join("")}</row>`;

    let rowNo = 1;
    const body = [];
    body.push(
      `<row r="1">${sh.columns.map((c, i) => `<c r="${columnLetter(i)}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`).join("")}</row>`
    );
    for (const r of sh.rows) body.push(rowXml(++rowNo, r, (c) => (sh.columns[c]?.type === "number" ? STYLE.number : STYLE.default)));
    if (sh.totalRow) body.push(rowXml(++rowNo, sh.totalRow, (c) => (sh.columns[c]?.type === "number" ? STYLE.boldNumber : STYLE.bold)));

    const cols = sh.columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join("");
    const lastCol = columnLetter(Math.max(0, sh.columns.length - 1));
    return (
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<dimension ref="A1:${lastCol}${rowNo}"/>` +
      `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
      `<cols>${cols}</cols><sheetData>${body.join("")}</sheetData></worksheet>`
    );
  });

  const files = [
    {
      name: "[Content_Types].xml",
      data: bytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
          `</Types>`
      ),
    },
    {
      name: "_rels/.rels",
      data: bytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`
      ),
    },
    {
      name: "xl/workbook.xml",
      data: bytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: bytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
          `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      ),
    },
    {
      // 0 기본 / 1 제목(굵게·회색 배경) / 2 숫자(천 단위 쉼표) / 3 합계 숫자(굵게) / 4 합계 글자(굵게)
      name: "xl/styles.xml",
      data: bytes(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
          `<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>` +
          `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
          `<fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill></fills>` +
          `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
          `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
          `<cellXfs count="5">` +
          `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
          `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf>` +
          `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
          `<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>` +
          `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
          `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
      ),
    },
    ...sheetXml.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: bytes(xml) })),
  ];
  return buildZip(files);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
