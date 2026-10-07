# Supabase 보안(RLS) 적용 가이드

| 파일 | 용도 |
|---|---|
| `01_rls_audit.sql` | 현재 DB 보안 상태 점검 (읽기 전용) |
| `02_rls_policies_DRAFT.sql` | RLS 정책 초안 (**운영 적용 전 반드시 테스트 프로젝트에서 먼저**) |
| `03_rls_rollback.sql` | 문제 발생 시 응급 복구 |
| `tests/` | 정책이 의도대로 동작하는지 로컬 PostgreSQL 에서 검증하는 시나리오 (65건) |

## 적용 순서
1. `/api/admin/backup` 으로 전체 백업을 받습니다.
2. SQL Editor 에서 `01_rls_audit.sql` 을 실행하고, 결과의 [A][B][C][G] 를 확인합니다.
   - [B]/[C] 에 `true` 조건의 느슨한 정책이 있으면 **먼저 삭제**해야 합니다. (정책은 OR 로 합쳐져서, 남아 있으면 제한이 무력화됩니다.)
3. **테스트용 Supabase 프로젝트**(운영 데이터 복원본)에서 `02_rls_policies_DRAFT.sql` 을 실행합니다.
4. 02 파일 맨 아래 체크리스트대로 일반 회원 / 회장 / 통합관리자 / 지급 담당 계정으로 화면을 직접 확인합니다.
5. 이상이 없으면 운영에 같은 순서로 적용합니다. 문제가 생기면 `03_rls_rollback.sql` 을 실행합니다.

## 자동 테스트 (선택)
로컬 PostgreSQL 에서 정책 로직만 검증합니다. (Supabase 의 `auth.uid()` 는 모의 함수로 대체)
```
createdb rlstest
psql -d rlstest -f supabase/tests/mock_schema.sql
psql -d rlstest -f supabase/02_rls_policies_DRAFT.sql
psql -d rlstest -f supabase/tests/rls_scenarios.sql   # 마지막에 passed / failed 요약 출력
```
※ `mock_schema.sql` 은 앱 코드에서 쓰는 컬럼만으로 만든 가짜 스키마입니다. 실제 DB 의 제약·컬럼과 다를 수 있으므로 위 3~4단계 확인은 생략하지 마세요.

## 알려진 한계
- 스토리지(`club-files` 버킷) 정책은 주석으로만 제공됩니다. 현재 버킷 설정을 확인한 뒤 적용하세요.
- 가입 대기(게스트) 회원이 모든 동호회의 공지·일반·사진 게시글을 볼 수 있는 현재 앱 동작을 그대로 유지했습니다. 막으려면 `rls_posts_select` 를 수정하세요.
- 승인된 회원은 서로의 이메일을 포함한 `users` 행을 조회할 수 있습니다. 필요하면 별도 뷰로 분리하는 것을 권장합니다.
