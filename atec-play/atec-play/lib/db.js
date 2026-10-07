// Supabase 조회 결과에 오류가 있으면 던져서 app/error.js 화면으로 보냅니다.
// (지금까지는 오류가 나도 data 가 비어 "데이터 없음"처럼 보여서 원인을 알 수 없었습니다.)
//
// 사용 예:  const { data: clubs } = ok(await supabase.from("clubs").select("*"), "동호회 목록");
export function ok(result, label = "데이터") {
  if (result?.error) {
    // 상세 원인은 서버 로그(Vercel Logs)에만 남기고, 화면에는 일반 문구만 보여줍니다.
    console.error(`[DB 오류] ${label}:`, result.error.code, result.error.message);
    throw new Error(`${label}을(를) 불러오지 못했습니다.`);
  }
  return result;
}
