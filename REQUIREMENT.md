# DECODED CRAWLER - 기능 명세서 (Functional Specification)

이 문서의 목표는 follow 중인 Instagram 계정 데이터를 수집/정규화한 뒤,  
warehouse의 seed 데이터(`seed_posts`, `seed_spots`, `seed_solutions`)를 생성/보강하고,  
최종적으로 backend Post API / Solution API를 통해 서비스용 `public` 데이터를 채워 넣는 전체 파이프라인을 정의하는 것입니다.

## Workflow Overview

현재 파이프라인은 3개 워크플로우(+Ops 수동 검수)로 운영됩니다.

1. `Sync`
2. `Spotter`
3. `Solver`

권장 실행 순서:

`Sync -> Ops Dashboard 수동 검수 -> Spotter -> Solver`

---

## Base Tables (Operational DB)

Sync 단계에서 주로 사용하는 기본 테이블:

- `posts`
- `images`
- `instagram_accounts`
- `brands`, `artists` (warehouse 논리 엔티티; Dashboard 승인 시 연결)
- `source_account`
- `group_members`

Seed 단계에서 사용하는 테이블:

- `seed_posts`
- `seed_asset`
- `seed_spots`
- `seed_solutions`

---

## 1) Sync Workflow

### 1-1. instagram sync

Instagram 원천 데이터 적재 및 관계 생성 단계.

- API
  - `instagram/sync`
- 주요 write 테이블/컬럼
  - `posts`: `account_id`, `posted_at`, `caption_text`, `tagged_account_ids`
  - `images`: `image_hash`, `image_url` (`CLOUDFLARE_R2_*` 설정 시 R2 public URL, 미설정 시 Supabase `SUPABASE_STORAGE_BUCKET`)
  - `instagram_accounts`: 신규 username upsert (미존재 tagged account)
- 매핑
  - Instagram post -> `posts` 1행
  - post 내 이미지 N개 -> `images` N행

### 1-2. fill with wiki data

신규/미완성 계정에 대해 정적/외부 정보 보강.

- 주요 write 테이블/컬럼
  - `instagram_accounts`: `account_type`, `name_ko`, `name_en`
- 매핑
  - `instagram_accounts.username` 기준 매칭 후 업데이트

### 1-3. sync account info

Instagram 프로필 실데이터 동기화.

- API
  - `instagram/account/backfill`
- 주요 write 테이블/컬럼
  - `instagram_accounts`: `display_name`, `bio`, `profile_image_url` (Supabase 프로필 버킷 public URL, `instagram-profile-images/…`), `updated_at`
- 매핑
  - source username -> `instagram_accounts.username`

### 1-4. augmentation name of brands

브랜드 계정명 보강 단계.

- 주요 write 테이블/컬럼
  - `instagram_accounts` (`account_type='brand'`): `name_en`, `name_ko`
- 매핑
  - `instagram_accounts`의 brand 레코드에 `name_en`, `name_ko` 보강

### 1-5. Dashboard: brand / artist 엔티티 승인

`instagram_accounts` 검수 큐(`needs_review`)에서 브랜드·아티스트 소속을 확정하고, 유저 노출용 엔티티 행과 맞춘다.

- 주요 write 테이블/컬럼
  - `instagram_accounts`: `needs_review = false`, `brand_id` **또는** `artist_id`, `entity_ig_role` (`primary` / `regional` / `secondary`), `entity_region_code` (선택)
  - `brands` 또는 `artists`: 신규 생성 또는 기존 행 선택; `primary_instagram_account_id`, `logo_image_url` (브랜드) / `profile_image_url` (아티스트) 동기화
- 규칙
  - `brand_id`와 `artist_id`는 동시에 non-null이면 안 됨 (DB CHECK)
  - 소속이 있으면 `entity_ig_role` 필수
  - 동일 브랜드(아티스트)당 `primary` 역할 IG는 최대 1개 (DB 부분 유니크)
  - 같은 IG는 여러 엔티티의 `primary_instagram_account_id`가 될 수 없음 (DB 부분 유니크)
- 매핑
  - 지역·부계정: `instagram_accounts`만 추가로 연결 (`brand_id`/`artist_id` 동일, `entity_ig_role`·`entity_region_code`로 구분)
  - 스키마: `supabase/warehouse/04_warehouse_brands_artists.sql` — 상세는 [SCHEMA.md](./SCHEMA.md)

## 2) Ops Dashboard 수동 검수 (Seed 생성 전)

Spotter/Solver 실행 전에 사람이 seed 대상 레코드를 확정합니다.

- 소스 테이블
  - `posts`, `images`
- 타깃 seed 테이블
  - `seed_posts`, `seed_asset`

### 2-1. posts -> seed_posts 매핑

- 키 매핑
  - `seed_posts.source_post_id <- posts.id`
  - `seed_posts.source_image_id <-` Ops에서 대표로 채택한 `images.id` (nullable)
- 주요 컬럼 매핑
  - `seed_posts.image_url <-` Ops Step2(선택/업로드)에서 확정된 대표 이미지 URL
  - `seed_posts.media_source <-` Ops Step1(URL source 지정) + domain 기반 파싱값
  - `seed_posts.context <-` Ops에서 확정한 context 값 (없으면 null)
  - `seed_posts.group_account_id <-` Ops에서 확정한 group 계정 id
  - `seed_posts.artist_account_id <-` Ops에서 확정한 artist 계정 id
  - `seed_posts.metadata <-` 운영 메모/검수 메타 (필요 시)

### 2-1a. group/artist 확정 규칙 (Ops)

입력 기준:

- `posts.tagged_account_ids`
- `instagram_accounts` (`account_type`, `username`, `name_en`, `name_ko`)
- `group_members` (group-artist 관계)

자동 규칙:

1. `tagged_account_ids` 중 `account_type='group'`가 1개면 해당 계정을 group 후보로 설정
2. `tagged_account_ids` 중 `account_type='artist'`가 1개면 해당 계정을 artist 후보로 설정
3. artist 후보가 2개 이상이면 `seed_posts.artist_account_id <- null`로 유지 (Ops 수동 선택)

group 선택 시 추가 규칙:

- group이 확정되면 `group_members`에서 해당 group의 artist 목록을 조회해 Ops 선택 UI에 표시
- Ops에서 최종 artist를 선택하면 `seed_posts.artist_account_id`에 반영
- group이 있어도 artist를 확정하지 못하면 `seed_posts.artist_account_id`는 null 유지

### 2-2. images -> seed_asset 매핑

- 키 매핑
  - `seed_asset.seed_post_id <- seed_posts.id`
- 주요 컬럼 매핑
  - `seed_asset.archived_url <-` Ops Step2 image URL ingest 입력값 (또는 업로드 저장 URL)
  - `seed_asset.source_url <-` 원본 image URL (mode=`image_url`일 때)
  - `seed_asset.source_domain <-` image URL의 domain
  - `seed_asset.image_hash <- images.image_hash`
  - `seed_asset.metadata <-` 이미지 관련 운영 메타(필요 시)

권장 규칙:

- Step2에서 이미지가 확정되면
  - 원본/저장 정보는 `seed_asset`에 저장
  - 대표 이미지 URL은 `seed_posts.image_url`에도 동기화

## 3) Spotter Workflow

확정된 seed post를 기준으로 Gemini item 추출 + SAM 위치 추출 + backend Post API 등록을 수행합니다.

- 입력
  - `seed_posts`, `seed_asset`
  - `seed_posts.status='approved'` 레코드 (처리 시작 시 `queued` 전환)
  - `seed_posts.media_source` 및 대표 이미지
  - Gemini 추출 프롬프트: `PROMPT.md`
- 출력 테이블/컬럼
  - `seed_spots`: `seed_post_id`, `request_order`, `position_left`, `position_top`, `subcategory_code`
  - `seed_solutions`: `seed_spot_id(nullable -> backfill)`, `product_name`, `brand`, `price_amount`, `price_currency`, `description`, `metadata`
- 매핑
  - `seed_spots.seed_post_id -> seed_posts.id`
  - Gemini로 item 후보를 추출하고(`brand`, `product_name`, `price`, `sam_prompt`)
  - 추출된 `sam_prompt`를 SAM API 입력으로 사용
  - Spot 좌표(`position_left`, `position_top`)만 저장
  - `subcategory_code`는 Spotter 단계에서 후보값 저장(미확정 가능)
  - Spot 생성 전, Gemini item 기준으로 `seed_solutions` 초기 row를 먼저 생성 (`seed_spot_id=null`)
  - Backend Post API 호출 시 전달한 spots 응답(`spot.id`)을 `seed_spots.backend_spot_id`에 저장
  - 이후 `request_order` 기준으로 `seed_solutions.seed_spot_id`를 backfill
  - 대상은 Ops Dashboard에서 살아남은 `seed_posts` 범위로 제한

---

## 4) Solver Workflow

Spotter에서 연결된 `seed_solutions.seed_spot_id`를 기준으로 URL을 채우고 backend Solution API를 호출합니다.

- 입력
  - `seed_solutions` (`seed_spot_id is not null` 대상)
- 출력 테이블/컬럼
  - `seed_solutions`: `original_url`, `product_name`, `brand`, `price_amount`, `price_currency`, `description`, `metadata`
  - `seed_solutions`: `backend_solution_id`, `status`, `publish_error`
- 매핑
  - 1차(Brave): item URL 후보 탐색 후 `original_url`/`thumbnail_url` 반영
  - 2차(backend Solution API): `seed_spot_id` 대상 솔루션 생성
  - 응답 id를 `backend_solution_id`로 저장하고 상태 업데이트

---

## End-to-End Mapping Summary

핵심 데이터 이동 경로:

1. `posts` + `images` + `instagram_accounts` 생성/보강 (`Sync`); Dashboard에서 `brands`/`artists` 연결 및 `needs_review` 완료 (`1-5`)
2. `posts -> seed_posts`, `images -> seed_asset` (`Ops`)
3. `seed_posts/seed_asset (+ Ops에서 확정한 group/artist)` 대상
   -> `approved`를 `queued`로 전환
   -> Gemini item 추출 + seed_solutions(seed_spot_id=null) 생성 + SAM spot 생성 + backend Post API 호출 (`Spotter`)
4. Spot 응답 id를 기준으로 `seed_solutions.seed_spot_id` backfill
   -> Brave URL 탐색 + backend Solution API 호출 (`Solver`)

핵심 FK/연결 키:

- `seed_asset.seed_post_id -> seed_posts.id`
- `seed_spots.seed_post_id -> seed_posts.id`
- `seed_solutions.seed_spot_id -> seed_spots.id`

---

## API Endpoints

- `instagram/sync`
- `instagram/account/backfill`
- Backend Post API (spot 포함 post 생성)
- Brave Browser API (`Solver` 단계 URL 탐색)
- Backend Solution API (spot 기준 solution 생성)

---

## Backend API Contracts

### 1) Post 생성 API

**Request (multipart/form-data):**

- `image`: binary (이미지 파일)
- `data`: JSON string

```json
{
  "media_source": {
    "type": "mv",
    "title": "APT.",
    "platform": "youtube",
    "timestamp": "01:23"
  },
  "group_name": "BLACKPINK",
  "artist_name": "Rosé",
  "context": "mv",
  "spots": [
    {
      "left": 45.5,
      "top": 30.2,
      "subcategory_code": "tops"
    },
    {
      "left": 60.0,
      "top": 15.0,
      "subcategory_code": "eyewear"
    }
  ],
  "metadata": {
    "subject": "Rosé",
    "items": {
      "Wearables": ["Tops", "Eyewear"]
    }
  }
}
```

참고:

- 이미지는 multipart로 전송되며 Post 생성 시 R2에 업로드됩니다.
- `spots[].subcategory_code`로 `subcategory_id`를 조회하여 저장합니다.

**Response (Post 생성):**

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "image_url": "https://r2.../image.jpg",
  "media_source": {},
  "group_name": "BLACKPINK",
  "artist_name": "Rosé",
  "context": "mv",
  "spots": [
    {
      "id": "uuid",
      "position_left": "45.5",
      "position_top": "30.2",
      "subcategory": {
        "id": "uuid",
        "code": "tops",
        "name": { "ko": "상의", "en": "Tops" },
        "category": {
          "id": "uuid",
          "code": "wearables",
          "name": { "ko": "패션 아이템", "en": "Wearables" }
        }
      },
      "status": "open"
    }
  ],
  "view_count": 0,
  "status": "active",
  "created_at": "timestamp"
}
```

### 2) Solution 등록 API

**Request (JSON):**

```json
{
  "original_url": "https://www.chanel.com/...",
  "product_name": "Chanel Tweed Jacket",
  "brand": "Chanel",
  "price": {
    "amount": 8500000,
    "currency": "KRW"
  },
  "description": "2024 F/W 컬렉션"
}
```

참고:

- `product_name`, `brand`, `price`는 선택값입니다.
- 미입력 시 URL 메타데이터 추출 결과를 사용합니다.

**Response (Solution 등록):**

```json
{
  "id": "uuid",
  "spot_id": "uuid",
  "user": {},
  "match_type": null,
  "product_name": "Chanel Tweed Jacket",
  "brand": "Chanel",
  "price": { "amount": 8500000, "currency": "KRW" },
  "original_url": "https://www.chanel.com/...",
  "affiliate_url": "https://affiliate.link/...",
  "thumbnail_url": "https://og-image.../thumbnail.jpg",
  "description": "2024 F/W 컬렉션",
  "vote_stats": { "accurate": 0, "different": 0 },
  "is_verified": false,
  "is_adopted": false,
  "created_at": "timestamp"
}
```

---

## Assumptions / TODO

- Spotter에서 `seed_solutions`는 먼저 `seed_spot_id=null`로 생성되고, post API 응답 spot id로 backfill됩니다.
- `seed_posts.image_url` 대표 이미지 선택 규칙(첫 이미지, with_items 우선, 수동 선택)을 확정해야 합니다.
- artist 후보가 다수인 경우 `seed_posts.artist_account_id`는 null로 두고 Ops에서 수동 확정합니다.
- 링크 후보 다건 저장 정책(요약 JSONB vs 별도 링크 테이블)이 필요하면 별도 테이블 설계를 추가합니다.
- YouTube·TikTok 등 비-IG 소셜은 별도 테이블(또는 `metadata`)로 확장; 현재 DDL은 IG 소속 중심이다.
