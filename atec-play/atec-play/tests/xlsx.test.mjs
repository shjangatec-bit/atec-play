import { test } from "node:test";
import assert from "node:assert/strict";
import { buildXlsx, columnLetter } from "../lib/xlsx.js";
import { crc32 } from "../lib/zip.js";

// 최소한의 ZIP 읽기: 끝 레코드 → 중앙 디렉터리 → 파일별 이름·CRC·내용 (저장 방식)
function readZip(u8) {
  const v = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const eocd = u8.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50, "끝 레코드 서명");
  const count = v.getUint16(eocd + 10, true);
  let pos = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let i = 0; i < count; i++) {
    assert.equal(v.getUint32(pos, true), 0x02014b50, "중앙 디렉터리 서명");
    const crc = v.getUint32(pos + 16, true);
    const size = v.getUint32(pos + 24, true);
    const nameLen = v.getUint16(pos + 28, true);
    const local = v.getUint32(pos + 42, true);
    const name = dec.decode(u8.subarray(pos + 46, pos + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50, "로컬 헤더 서명");
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = u8.subarray(start, start + size);
    assert.equal(crc32(data), crc, `CRC 일치: ${name}`);
    files[name] = dec.decode(data);
    pos += 46 + nameLen;
  }
  return files;
}

const sample = () =>
  buildXlsx([
    {
      name: "월별 지원금",
      columns: [{ header: "동호회", width: 20 }, { header: "금액", type: "number" }, { header: "비고" }],
      rows: [
        ["놀면 뭐하니?", 123456, "A & B <특수> \"문자\""],
        ["=SUM(A1:A9)", 0, "+cmd|' /C calc'!A0"],
        ["빈 값", null, ""],
      ],
      totalRow: ["합계", 123456, ""],
    },
    { name: "보고서:내역/2", columns: [{ header: "제목" }], rows: [["가"]] },
  ]);

test("xlsx: 필수 파일이 모두 있고 ZIP 구조·CRC가 올바르다", () => {
  const files = readZip(sample());
  for (const n of ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
    assert.ok(n in files, n);
  }
  assert.match(files["[Content_Types].xml"], /worksheets\/sheet2\.xml/);
});

test("xlsx: 숫자는 숫자 셀(천 단위 서식), 글자는 문자열 셀, 제목 줄은 고정", () => {
  const sheet = readZip(sample())["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="B2" s="2"><v>123456<\/v><\/c>/);           // 숫자
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">동호회<\/t>/); // 제목
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(sheet, /<c r="B5" s="3"><v>123456<\/v><\/c>/);           // 합계 줄(굵게)
  assert.match(sheet, /<c r="B4" s="2"\/>/);                             // 빈 값
});

test("xlsx: 특수문자는 이스케이프되고, 수식처럼 보이는 글자도 문자열로만 저장된다(수식 주입 차단)", () => {
  const sheet = readZip(sample())["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /A &amp; B &lt;특수&gt; &quot;문자&quot;/);
  assert.match(sheet, /<c r="A3" s="0" t="inlineStr"><is><t xml:space="preserve">=SUM\(A1:A9\)<\/t>/);
  assert.ok(!/<f>/.test(sheet), "수식(<f>) 요소가 없어야 함");
});

test("xlsx: 시트 이름에서 금지 문자 제거, 열 문자 변환", () => {
  const wb = readZip(sample())["xl/workbook.xml"];
  assert.match(wb, /name="월별 지원금"/);
  assert.match(wb, /name="보고서 내역 2"/);
  assert.deepEqual([0, 25, 26, 27, 51, 52, 701, 702].map(columnLetter), ["A", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA"]);
});

test("xlsx: 한글 파일 이름·큰 데이터(2천 행)도 올바르게 저장", () => {
  const rows = Array.from({ length: 2000 }, (_, i) => [`동호회${i}`, i * 1000]);
  const files = readZip(buildXlsx([{ name: "대용량", columns: [{ header: "이름" }, { header: "값", type: "number" }], rows }]));
  const sheet = files["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="B2001" s="2"><v>1999000<\/v><\/c>/);
  assert.match(sheet, /<dimension ref="A1:B2001"\/>/);
});
