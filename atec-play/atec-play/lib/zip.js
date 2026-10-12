// 외부 라이브러리 없이 ZIP(압축 없는 저장 방식)을 만듭니다. 브라우저·서버 모두에서 동작합니다. (.xlsx 파일이 ZIP 형식입니다)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: [{ name: "경로/이름", data: Uint8Array }]
export function buildZip(files, date = new Date()) {
  const enc = new TextEncoder();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  const entries = files.map((f) => ({ name: enc.encode(f.name), data: f.data, crc: crc32(f.data) }));
  let size = 22;
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length;

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let pos = 0;
  const offsets = [];

  for (const e of entries) {                       // 로컬 파일 헤더 + 데이터
    offsets.push(pos);
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0x0800, true);         // 파일 이름 UTF-8
    view.setUint16(pos + 8, 0, true);              // 저장(무압축)
    view.setUint16(pos + 10, dosTime, true);
    view.setUint16(pos + 12, dosDate, true);
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.data.length, true);
    view.setUint32(pos + 22, e.data.length, true);
    view.setUint16(pos + 26, e.name.length, true);
    view.setUint16(pos + 28, 0, true);
    out.set(e.name, pos + 30);
    out.set(e.data, pos + 30 + e.name.length);
    pos += 30 + e.name.length + e.data.length;
  }

  const cdStart = pos;
  entries.forEach((e, i) => {                      // 중앙 디렉터리
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, dosTime, true);
    view.setUint16(pos + 14, dosDate, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.data.length, true);
    view.setUint32(pos + 24, e.data.length, true);
    view.setUint16(pos + 28, e.name.length, true);
    view.setUint32(pos + 42, offsets[i], true);
    out.set(e.name, pos + 46);
    pos += 46 + e.name.length;
  });

  view.setUint32(pos, 0x06054b50, true);           // 끝 레코드
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, pos - cdStart, true);
  view.setUint32(pos + 16, cdStart, true);
  return out;
}
