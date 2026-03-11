# OPS Dashboard DB Schema Guide

이 문서는 OPS Dashboard를 다른 작업환경으로 옮길 때 필요한 DB 스키마 의존성을 정리한다.

## 1) 스키마 계층

- `raw` 계층 (기존 warehouse)
  - 크롤링 결과 원본/중간 데이터
  - 핵심 테이블: `post`, `image`, `post_image`, `item`
- `seed` 계층 (ops 대시보드 대상)
  - source 확정/검수(승인·반려)용 데이터
  - 핵심 테이블: `seed_posts`, `seed_asset`, `seed_spots`, `seed_solutions`
  - backend 대응: `posts <- seed_posts`, `spots <- seed_spots`, `solutions <- seed_solutions`
  - backend 반영(write)은 ops-dashboard가 아닌 n8n 서버 담당

## 2) 필수 선행 조건

### raw 테이블 존재

OPS 후보 생성 기준이 아래 조건을 사용하므로 raw 테이블이 먼저 있어야 한다.

- `post.ts >= '2025-01-01_00-00-00'`
- `image.with_items = true`
- `post_image`로 `post`와 `image` 연결

### seed 테이블 생성

아래 DDL을 적용한다.

- `supabase/warehouse/seed_tables.sql`

또는 새로운 레포로 복사할 경우 동일 파일을 `db/seed_tables.sql`로 포함해 적용한다.

## 3) 권장 추가 컬럼 (raw.post)

캡션 백필을 위해 `post.caption_text`를 사용하는 경우 아래 SQL을 적용한다.

```sql
alter table public.post
add column if not exists caption_text text null;
```

## 4) 후보 생성 쿼리 기준 (참고)

```sql
select
  p.id as post_id,
  p.account,
  p.ts,
  i.id as image_id,
  i.image_url,
  i.image_hash
from public.post p
join public.post_image pi on pi.post_id = p.id
join public.image i on i.id = pi.image_id
where p.ts >= '2025-01-01_00-00-00'
  and i.with_items = true;
```

## 5) 대체 이미지 조회 기준 (같은 post, with_items=false)

```sql
select
  i.id as image_id,
  i.image_url,
  i.image_hash
from public.post_image pi
join public.image i on i.id = pi.image_id
where pi.post_id = :post_id
  and i.with_items = false;
```

## 6) seed 상태 운영 규칙

- 기본 상태: `review_status = 'draft'`
- 승인 가능 상태: `approved`
- 반려 상태: `rejected`
- 상태 전이는 `draft -> approved|rejected`만 허용

## 7) backend 매핑 기준

- `seed_posts` -> `posts`
  - 핵심 필드: `image_url`, `media_type`, `title`, `group_name`, `artist_name`, `context`, `status`
- `seed_spots` -> `spots`
  - 핵심 필드: `post_id`, `position_left`, `position_top`, `subcategory_id`, `status`
- `seed_solutions` -> `solutions`
  - 핵심 필드: `spot_id`, `title`, `original_url`, `affiliate_url`, `thumbnail_url`, `status`

주의:
- `seed`와 `backend`가 서로 다른 DB라면 FK를 걸 수 없다.
- 따라서 `backend_post_id`, `backend_spot_id`, `backend_solution_id`는
  참조용 식별자 컬럼으로만 유지하고, 무결성은 애플리케이션/배치 로직에서 검증한다.
- backend 반영 실행 주체는 n8n 서버이며 ops-dashboard는 반영 API를 호출하지 않는다.

## 8) 배포 체크리스트

- [ ] raw 스키마 적용 (`post/image/post_image/item`)
- [ ] seed 스키마 적용 (`seed_tables.sql`)
- [ ] `caption_text` 컬럼 적용(사용 시)
- [ ] 스토리지 버킷 생성 (`images` 권장)
- [ ] OPS 환경변수 세팅 (`ops-dashboard/.env.example`)
