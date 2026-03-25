# decoded-seed-ops PLAN

## 1. 목적

`ops-dashboard`는 크롤링 원천 데이터에서 cold-start 후보를 선별하고, 원본 source를 확정한 뒤 검수(승인/반려)까지 수행하는 운영 도구다.

핵심 목표:
- 후보 자동 생성 (`posts.posted_at >= 2025-01-01T00:00:00Z` + `images.with_items = true`)
- 원본 source 확정 (동일 post 대체 이미지 선택 / URL 입력 / 파일 업로드)
- 검수 상태 관리 (`draft`, `approved`, `rejected`)
- backend 반영은 ops-dashboard가 아닌 n8n 서버 담당

---

## 2. 배포/아키텍처 방향

### 배포
- Vercel 단일 배포 (프론트 + 서버 함수)
- 별도 FastAPI 서버는 MVP에서 사용하지 않음

### 서버 권한 모델
- `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 서버 함수에서만 사용
- 브라우저에는 `NEXT_PUBLIC_*` 값만 노출
- DB/Storage 쓰기 작업은 모두 서버 함수(API route) 경유

### 기술 스택 (MVP)
- Next.js (App Router)
- Supabase (DB)
- Cloudflare R2 (이미지 스토리지)
- TypeScript
- Vercel

---

## 3. 데이터 모델 기준

seed 테이블은 backend 계약(`posts/spots/solutions`)에 맞춰 설계하되, review 컬럼을 중심으로 운영한다.

- `warehouse.seed_posts` -> backend `posts` 대응
- `warehouse.seed_spots` -> backend `spots` 대응
- `warehouse.seed_solutions` -> backend `solutions` 대응
- `warehouse.seed_asset` -> source provenance + archived image

주의:
- seed DB와 backend DB가 분리되어 있으므로 cross-DB FK는 사용하지 않는다.
- `backend_post_id`, `backend_spot_id`, `backend_solution_id`는 참조 ID로만 관리한다.

핵심 관계:
- `seed_posts.source_post_id -> posts.id`
- `seed_posts.source_image_id -> images.id`
- `seed_asset.seed_post_id -> seed_posts.id`
- `seed_spots.seed_post_id -> seed_posts.id`
- `seed_solutions.seed_spot_id -> seed_spots.id`

---

## 4. MVP 기능 범위

### 4.1 후보 생성
- 기준 조건으로 후보를 `draft` 상태로 생성:
  - `posts.posted_at >= '2025-01-01T00:00:00Z'`
  - `images.with_items = true`

### 4.2 원본 source 확정
- 후보와 같은 post의 `with_items=false` 이미지 목록 제시
- 운영자가 선택하거나 직접 입력:
  - URL 입력
  - 파일 업로드

### 4.3 검수
- 상태 전이:
  - `draft -> approved`
  - `draft -> rejected`
- 승인자/승인시각 기록

### 4.4 backend 반영 책임
- backend 반영은 n8n 서버가 담당
- ops-dashboard는 source 확정 + 검수 상태(`approved`/`rejected`)까지 담당

---

## 5. API/서버 함수 설계 (Next.js route handlers)

- `POST /api/candidates/build`
  - 후보 생성 실행
- `GET /api/candidates?status=draft`
  - 검수 큐 조회
- `GET /api/candidates/{id}/alternatives`
  - 같은 post의 대체 이미지(`images.with_items=false`) 조회
- `POST /api/candidates/{id}/source/select`
  - source 확정(대체 선택/URL/업로드)
- `POST /api/candidates/{id}/approve`
- `POST /api/candidates/{id}/reject`

---

## 6. 환경변수 정책

### 서버 전용 (민감)
- `SUPABASE_URL` (backend DB project)
- `SUPABASE_SERVICE_ROLE_KEY` (backend DB project)
- `SUPABASE_DB_SCHEMA` (`warehouse`)
- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_R2_BUCKET`
- `CLOUDFLARE_R2_PUBLIC_BASE_URL`
- `CLOUDFLARE_R2_PREFIX` (optional, default `ops-seed`)

### 공개 가능 (클라이언트)
- `NEXT_PUBLIC_APP_ENV` (필요 시)

규칙:
- 서비스 키는 절대 `NEXT_PUBLIC_` 접두사 사용 금지
- 브라우저에서 직접 DB write 금지

---

## 7. UI 페이지 구성 (MVP)

- `/candidates`
  - draft 목록, 필터, 검색
- `/candidates/[id]`
  - 후보 상세, 대체 이미지 목록, source 확정 액션
- `/review`
  - 승인/반려 작업 큐

---

## 8. 구현 단계

1. 레포 생성 + Next.js 초기화 + Vercel 연결
2. env 세팅 (`.env.local`, Vercel env)
3. seed DDL 적용 및 DB 연결 검증
4. 후보 생성 API 구현
5. 후보 목록/상세 UI 구현
6. source 확정(선택/URL/업로드) 구현
7. 검수 상태 전이 구현
8. 에러 처리/로그/리트라이 최소 기능 추가
9. 운영 체크리스트 문서화

---

## 9. 수용 기준 (Acceptance Criteria)

- draft 후보가 기준 조건으로 생성된다.
- 각 후보에서 대체 이미지 목록이 정상 노출된다.
- source 확정(선택/URL/업로드) 후 `seed_asset`에 provenance가 저장된다.
- `draft`에서만 `approved/rejected`로 상태 전이가 가능하다.
- backend 반영은 n8n 서버가 담당하며, ops-dashboard는 반영 API를 직접 호출하지 않는다.
- 민감 키가 클라이언트로 노출되지 않는다.

---

## 10. 리스크 및 대응

- 원본 URL 만료/삭제:
  - source 확정 시 bucket archive(`seed_asset.archived_url`)를 canonical로 사용
- 중복 이미지:
  - `images`는 `(post_id, image_hash)` unique 유지
- 상태 꼬임:
  - 상태 전이 규칙 엄격 적용 (`draft`에서만 승인/반려)
- 분리 DB 무결성:
  - backend 반영은 n8n에서 검증/처리하고 ops-dashboard는 참조 ID만 관리

---

## 11. 후보 생성 SQL (MVP 기준)

```sql
insert into warehouse.seed_posts (
  source_post_id,
  source_image_id,
  image_url,
  status,
  created_at,
  updated_at
)
select
  p.id as source_post_id,
  i.id as source_image_id,
  i.image_url,
  'draft',
  now(),
  now()
from warehouse.posts p
join warehouse.images i on i.post_id = p.id
where p.posted_at >= timestamptz '2025-01-01 00:00:00+00'
  and i.with_items = true
  and not exists (
    select 1
    from warehouse.seed_posts sp
    where sp.source_post_id = p.id
      and sp.source_image_id = i.id
  );
```
