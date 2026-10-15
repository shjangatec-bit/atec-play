// 검색 상자: 일반 GET 폼이라 주소(?q=...)에 검색어가 남아 새로고침·공유가 됩니다.
export default function SearchBox({ action, value, placeholder, hidden = {}, clearHref }) {
  return (
    <form method="get" action={action} className="row-flex" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }} role="search">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <input
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        maxLength={200}
        autoComplete="off"
        aria-label="검색어"
        style={{ flex: 1, minWidth: 220, maxWidth: 480, height: 38, border: "1px solid var(--line)", borderRadius: 8, padding: "0 12px", fontSize: 14 }}
      />
      <button className="btn-sm btn-approve" style={{ height: 38, padding: "0 16px" }}>검색</button>
      {value && clearHref && (
        <a className="btn-sm btn-outline" href={clearHref} style={{ height: 38, display: "inline-flex", alignItems: "center" }}>검색 지우기</a>
      )}
    </form>
  );
}
