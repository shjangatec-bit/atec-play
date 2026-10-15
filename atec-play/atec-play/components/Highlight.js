import { highlightSegments } from "@/lib/search";

// 검색어와 일치한 글자만 강조해서 보여줍니다. (서버·클라이언트 어디서나 사용 가능, 글자를 그대로 출력하므로 HTML 로 해석되지 않음)
export default function Highlight({ text, terms }) {
  if (!terms || terms.length === 0) return <>{text}</>;
  return (
    <>
      {highlightSegments(text, terms).map((s, i) =>
        s.hit ? <mark className="hit" key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>
      )}
    </>
  );
}
