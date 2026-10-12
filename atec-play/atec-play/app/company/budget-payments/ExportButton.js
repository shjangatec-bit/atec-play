"use client";
import { useState } from "react";
import { buildXlsx, XLSX_MIME } from "@/lib/xlsx";

// 화면에 보이는 그대로(지급 당시 금액 포함)를 엑셀 파일로 내려받습니다. 서버로 다시 요청하지 않고 브라우저에서 만듭니다.
export default function ExportButton({ fileName, sheets, disabled }) {
  const [busy, setBusy] = useState(false);

  function download() {
    try {
      setBusy(true);
      const bytes = buildXlsx(sheets);
      const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_MIME }));
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      alert("엑셀 파일을 만들지 못했습니다: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn-sm btn-outline" onClick={download} disabled={disabled || busy} title={disabled ? "내려받을 내용이 없습니다" : undefined}>
      {busy ? "만드는 중..." : "엑셀 다운로드"}
    </button>
  );
}
