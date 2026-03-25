# SCHEMA.md - DECODED warehouse 데이터베이스 스키마

**Version:** 1.2.0  
**Last Updated:** 2026.03.21
**Parent Document:** [REQUIREMENT.md](./REQUIREMENT.md)

---

> 이 문서는 REQUIREMENT.md에서 분리된 상세 데이터베이스 스키마 문서입니다.
> 파이프라인/워크플로우 개요는 [REQUIREMENT.md](./REQUIREMENT.md) 참조

---

## 목차

1. [핵심 테이블](#1-핵심-테이블)
2. [인덱스](#2-인덱스)
3. [Row Level Security (RLS)](#3-row-level-security-rls)

---

## 1. 핵심 테이블

본 문서 기준 스키마 원칙:

- `warehouse.posts`, `warehouse.images`는 Instagram 원천(raw) 데이터
- `warehouse.instagram_accounts`, `warehouse.group_members`는 계정 마스터/관계(raw+curation) 데이터
- `warehouse.brands`, `warehouse.artists`는 유저 노출용 논리 엔티티(로고·프로필·대표 IG); 소속 IG 행은 `instagram_accounts.brand_id` / `artist_id`로 묶임
- `warehouse.seed_posts`, `warehouse.seed_spots`, `warehouse.seed_solutions`는 배포 준비(seed) 데이터
- `seed`는 backend API 호출 단위를 기준으로 구성

### 1.1 Raw Layer

#### `warehouse.posts`

- 목적: Instagram post 원천 데이터 저장
- 주요 컬럼(예정):
  - `id` (uuid, PK)
  - `account_id` (uuid, source instagram account)
  - `posted_at` (timestamptz, 게시 시각)
  - `caption_text` (text, nullable)
  - `tagged_account_ids` (uuid[], nullable)
  - `created_at` (timestamptz)

#### `warehouse.instagram_accounts`

- 목적: Instagram 계정 마스터 (artist/group/brand/source/influencer/place 분류 포함)
- 주요 컬럼(합의 반영):
  - `id` (uuid, PK)
  - `username` (text, unique, not null)
  - `account_type` (enum: `artist`, `group`, `brand`, `source`, `influencer`, `place`, `other`)
  - `name_ko`, `name_en` (text, nullable)
  - `display_name`, `bio`, `profile_image_url` (text, nullable) — **Supabase Storage** `SUPABASE_PROFILE_BUCKET` public URL (`instagram-profile-images/{account_id}.…`). IG CDN(`scontent-…`)은 저장하지 않음(만료).
  - `is_active` (bool, default true)
  - `metadata` (jsonb, nullable)
  - `wikidata_status` (text, nullable; `matched/not_found/ambiguous/error`)
  - `wikidata_id` (text, nullable)
  - `needs_review` (bool, **nullable**, default `null`) — 검수 상태
    - `null`: Sync 등으로 row만 생긴 직후, 또는 `name_en`/`name_ko` 보강(위키 등) **이전**
    - `true`: 보강 워크플로 이후 **검수 대기** (대시보드 큐)
    - `false`: 검수 **완료**
  - `brand_id` (uuid, nullable, FK → `warehouse.brands.id`) — Dashboard 승인 후 소속 브랜드
  - `artist_id` (uuid, nullable, FK → `warehouse.artists.id`) — Dashboard 승인 후 소속 아티스트
  - `entity_ig_role` (enum `warehouse.entity_ig_role`, nullable) — 소속이 있을 때 필수: `primary` / `regional` / `secondary`
  - `entity_region_code` (text, nullable) — 지역 공식 계정 등 (예: ISO 3166-1 alpha-2)
  - 체크: `brand_id`와 `artist_id` 동시 non-null 불가; 둘 중 하나라도 있으면 `entity_ig_role` not null
  - 부분 유니크: 브랜드(아티스트)당 `entity_ig_role = primary`인 IG 행은 최대 1개
  - `created_at`, `updated_at` (timestamptz)

#### `warehouse.entity_ig_role` (enum)

- 값: `primary` (대표), `regional` (지역 공식), `secondary` (부계·서브)

#### `warehouse.brands`

- 목적: 브랜드 엔티티(앱·뷰 노출용); 로고·이름·대표 IG를 한 행에 둘 수 있음
- 주요 컬럼:
  - `id` (uuid, PK)
  - `name_ko`, `name_en` (text, nullable)
  - `logo_image_url` (text, nullable)
  - `primary_instagram_account_id` (uuid, nullable, FK → `warehouse.instagram_accounts.id`, on delete set null)
  - `metadata` (jsonb, nullable)
  - `created_at`, `updated_at` (timestamptz)
- 부분 유니크: `primary_instagram_account_id`가 non-null이면 전역에서 한 번만 등록(한 IG가 두 브랜드의 대표가 되지 않음)
- 트리거: `touch_updated_at()`
- RLS: enabled (`03` 패턴과 동일)

#### `warehouse.artists`

- 목적: 아티스트 엔티티(앱·뷰 노출용)
- 주요 컬럼:
  - `id` (uuid, PK)
  - `name_ko`, `name_en` (text, nullable)
  - `profile_image_url` (text, nullable)
  - `primary_instagram_account_id` (uuid, nullable, FK → `warehouse.instagram_accounts.id`, on delete set null)
  - `metadata` (jsonb, nullable)
  - `created_at`, `updated_at` (timestamptz)
- 부분 유니크: `primary_instagram_account_id` non-null 시 전역 유일
- 트리거: `touch_updated_at()`
- RLS: enabled

#### `warehouse.group_members`

- 목적: group - artist 멤버십 관계 저장
- 주요 컬럼(합의 반영):
  - `group_account_id` (uuid, PK part, FK to `warehouse.instagram_accounts.id`)
  - `artist_account_id` (uuid, PK part, FK to `warehouse.instagram_accounts.id`)
  - `is_active` (bool, default true)
  - `metadata` (jsonb, nullable)
  - `created_at`, `updated_at` (timestamptz)
- 체크 제약:
  - `group_account_id <> artist_account_id`
- 트리거:
  - `touch_updated_at()`

#### `warehouse.images`

- 목적: Instagram 원천 이미지 저장
- 주요 컬럼(예정):
  - `id` (uuid, PK)
  - `post_id` (uuid, FK to `warehouse.posts.id`)  # FK는 02 파일에서 정의
  - `image_hash` (text, post 내 unique 제약)
  - `image_url` (text) — sync 시 **Cloudflare R2** public URL(권장) 또는 R2 미설정 시 Supabase Storage URL
  - `with_items` (bool)
  - `status` (text or enum)
  - `created_at` (timestamptz)

### 1.2 Seed Layer

#### `warehouse.seed_posts`

- 목적: publish 대상 이미지 단위 레코드
- 특징: Instagram post 단위가 아니라 "배포 대상 이미지 단위"
- 주요 컬럼(예정):
  - `id` (uuid, PK)
  - `source_post_id` (uuid, nullable, raw post 참조)
  - `source_image_id` (uuid, nullable, raw image 참조)
  - `image_url` (text, Ops 확정 대표 이미지)
  - `media_source` (jsonb)
  - `group_account_id`, `artist_account_id` (uuid, nullable)
  - `context` (text, nullable)
  - `metadata` (jsonb, nullable)
  - `status` (text: draft/approved/queued/published/failed)
  - `backend_post_id` (uuid, nullable, unique)
  - `publish_error` (text, nullable)
  - `created_at`, `updated_at` (timestamptz)

#### `warehouse.seed_asset`

- 목적: `seed_posts`의 이미지 후보군 저장 (자동 후보 + 수동 입력 + 업로드)
- 주요 컬럼(예정):
  - `id` (uuid, PK)
  - `seed_post_id` (uuid, FK to `warehouse.seed_posts.id`)
  - `source_url`, `source_domain` (text, nullable)
  - `archived_url` (text, nullable)
  - `image_hash` (text, unique)
  - `metadata` (jsonb, nullable)
  - `created_at`, `updated_at` (timestamptz)

후보 생성 규칙:

1. 자동 후보: 같은 post의 이미지 중 with_items 우선
2. 수동 URL: Ops가 직접 URL 입력
3. 업로드: Ops가 파일 업로드로 추가

대표 이미지 규칙:

- 후보군은 `seed_asset`에 저장
- 최종 채택 1장은 `seed_posts.image_url`에 동기화

#### `warehouse.seed_spots`

- 목적: post 생성 API 요청용 좌표 데이터
- 주요 컬럼(예정):
  - `id` (uuid, PK)
  - `seed_post_id` (uuid, FK)
  - `request_order` (int, 요청 spot 순서)
  - `position_left`, `position_top` (numeric/text)
  - `subcategory_code` (text)
  - `status` (text: draft/queued/published/failed)
  - `backend_spot_id` (uuid, nullable, unique)
  - `publish_error` (text, nullable)
  - `created_at`, `updated_at` (timestamptz)

#### `warehouse.seed_solutions`

- 목적: solution API 요청용 상품 링크/설명 데이터
- 주요 컬럼(예정):
  - `id` (uuid, PK)
  - `seed_spot_id` (uuid, nullable, FK; Spotter 후 backfill)
  - `original_url` (text, nullable)
  - `product_name`, `brand`, `description` (text, nullable)
  - `price_amount` (numeric, nullable)
  - `price_currency` (text, nullable)
  - `metadata` (jsonb, nullable)
  - `status` (text: draft/queued/published/failed)
  - `backend_solution_id` (uuid, nullable, unique)
  - `publish_error` (text, nullable)
  - `created_at`, `updated_at` (timestamptz)

---

## 2. 인덱스

최소 인덱스 권장:

- `warehouse.posts`
  - `(account_id, posted_at)` unique
  - `posted_at`
  - `account_id`
  - `tagged_account_ids` (GIN)
- `warehouse.instagram_accounts`
  - `username` unique
  - `account_type`
  - `is_active`
  - `brand_id`, `artist_id` (partial btree, non-null 시)
  - 부분 유니크: `(brand_id)` where `entity_ig_role = primary`
  - 부분 유니크: `(artist_id)` where `entity_ig_role = primary`
- `warehouse.brands`
  - 부분 유니크: `primary_instagram_account_id` (non-null)
- `warehouse.artists`
  - 부분 유니크: `primary_instagram_account_id` (non-null)
- `warehouse.group_members`
  - `(group_account_id, artist_account_id)` PK
  - `artist_account_id`
  - `is_active`
- `warehouse.images`
  - `(post_id, image_hash)` unique
  - `post_id`
  - `with_items`
- `warehouse.seed_posts`
  - `status`
  - `source_post_id`
  - `source_image_id`
  - `backend_post_id` unique
- `warehouse.seed_asset`
  - `seed_post_id`
  - `image_hash` unique
- `warehouse.seed_spots`
  - `seed_post_id`
  - `request_order`
  - `backend_spot_id` unique
- `warehouse.seed_solutions`
  - `seed_spot_id`
  - `status`
  - `backend_solution_id` unique
  - `original_url`

---

## 3. Row Level Security (RLS)

정책 원칙:

- `warehouse`는 서버/배치 전용 스키마
- `publishable key (anon/authenticated)`로는 접근 불가
- 서비스 role(백엔드 서버)만 접근 허용

권장 설정:

1. `warehouse` 모든 테이블에 `enable row level security` (`brands`, `artists` 포함)
2. `anon`, `authenticated` 대상 정책 생성하지 않음 (또는 `using (false)`)
3. dashboard/백엔드는 service role 또는 server-side privileged role로만 접근
4. 클라이언트 앱에서 `warehouse` direct read/write 금지

---

> 구현 파일 분리 원칙
>
> - `01_warehouse_schema.sql`: schema + table 정의
> - `02_warehouse_fk_indexes.sql`: FK + index + constraint + `touch_updated_at`
> - `03_warehouse_rls.sql`: RLS + grants/revoke + policy
> - `04_warehouse_brands_artists.sql`: `brands`, `artists`, `instagram_accounts` 소속 컬럼 + enum `entity_ig_role`
