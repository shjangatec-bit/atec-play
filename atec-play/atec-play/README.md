# ATEC PLAY — 통합 동호회 관리 시스템

Next.js 14 + Supabase로 만든 실제 동작하는 웹앱입니다.

## 로컬에서 먼저 확인하고 싶다면

```
npm install
npm run dev
```

`.env.local` 파일에 Supabase 프로젝트 URL과 Publishable key가 이미 채워져 있습니다 (`atecplay` 프로젝트 기준).

---

## Vercel에 배포하기 (실제 웹 주소 만들기)

### 1단계. GitHub에 코드 올리기

Git을 몰라도 됩니다. GitHub 웹사이트에서 드래그 앤 드롭으로 가능합니다.

1. https://github.com 접속 → 로그인(계정 없으면 가입) → 우측 상단 "+" → **New repository**
2. Repository name: `atec-play` 입력 → **Create repository**
3. 생성된 저장소 페이지에서 **uploading an existing file** 링크 클릭
4. 이 zip 파일의 압축을 풀어서 나온 **모든 파일과 폴더**를 통째로 드래그해서 업로드 영역에 놓기
   - `node_modules` 폴더와 `.next` 폴더는 **올리지 마세요** (있다면 삭제하고 올리기 — 용량이 크고 필요 없습니다)
5. 하단 "Commit changes" 클릭

### 2단계. Vercel과 연결하기

1. https://vercel.com 접속 → **Continue with GitHub**로 로그인
2. 대시보드에서 **Add New → Project** 클릭
3. 방금 만든 `atec-play` 저장소를 찾아서 **Import** 클릭
4. **Environment Variables** 항목을 펼쳐서 아래 2개를 추가
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://dyirfpwzqrdjttfbbdnx.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_wT8-93cdmrROJpVeE55lMw_8TQCWzGl`
5. **Deploy** 클릭 → 1~2분 대기

완료되면 `atec-play-xxxx.vercel.app` 같은 실제 주소가 생깁니다. 이 주소가 발표 때 시연하실 사이트입니다.

### 배포 후 꼭 해야 할 일 — Supabase에 접속 허용 주소 추가

1. Supabase 대시보드 → **Authentication → URL Configuration**
2. **Site URL**에 방금 생성된 Vercel 주소(`https://atec-play-xxxx.vercel.app`) 입력
3. **Redirect URLs**에도 같은 주소 추가 후 저장

이 설정을 안 하면 배포된 사이트에서 로그인이 안 될 수 있습니다.

---

## 시연용 로그인 계정

`03_설정_가이드.md`에 안내된 8개 계정 그대로 사용하시면 됩니다. (비밀번호 전부 `Demo1234!`)

## 알아두실 점 (지금 버전의 한계)

- 지금 배포된 버전은 "로그인한 사람은 다 접근 가능"이라는 최소 보안 수준입니다(DB 단의 세밀한 RLS는 다음 단계 작업). 화면에 뭐가 보이고 뭘 할 수 있는지는 애플리케이션 코드에서 권한을 체크해서 제어하고 있습니다.
- 탈회 신청은 이번 버전에 아직 없습니다(가입 신청/승인까지만 구현). 발표 후 필요하시면 이어서 추가해드리겠습니다.
- 사진 갤러리는 실제 업로드는 되지만 목록에는 자리표시자(색상 박스)로 표시됩니다. 실제 썸네일 이미지 표시는 다음 단계에서 다듬을 수 있습니다.
