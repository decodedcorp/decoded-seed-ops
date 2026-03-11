-- Warehouse seed tables for curated cold-start data.
-- Canonical tables: public.seed_posts / public.seed_spots / public.seed_solutions
-- Design principle:
-- 1) Keep backend-compatible columns in seed tables.
-- 2) Add ops-only columns for review/export workflow.
-- 3) Preserve source provenance metadata.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'seed_source_type') then
    create type public.seed_source_type as enum (
      'instagram',
      'youtube',
      'web',
      'manual_upload',
      'other'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'seed_review_status') then
    create type public.seed_review_status as enum (
      'draft',
      'approved',
      'rejected'
    );
  end if;
end $$;

create table if not exists public.seed_posts (
  id uuid not null default gen_random_uuid(),
  backend_post_id uuid null,
  source_post_id uuid null,
  source_with_items_image_id uuid null,
  user_id uuid null,
  image_url text not null,
  media_type character varying not null default 'image',
  title character varying null,
  media_metadata json null,
  group_name character varying null,
  artist_name character varying null,
  context character varying null,
  view_count integer not null default 0,
  status character varying not null default 'active',
  trending_score double precision null,
  created_with_solutions boolean null,
  source_type public.seed_source_type not null default 'instagram'::seed_source_type,
  source_url text null,
  source_domain text null,
  source_author text null,
  captured_at timestamp with time zone null,
  ingested_at timestamp with time zone not null default now(),
  candidate_generated_at timestamp with time zone not null default now(),
  review_status public.seed_review_status not null default 'draft'::seed_review_status,
  ready_for_backend boolean not null default false,
  approved_by text null,
  approved_at timestamp with time zone null,
  exported_to_backend_at timestamp with time zone null,
  export_error text null,
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint seed_posts_pkey primary key (id),
  constraint seed_posts_backend_post_id_key unique (backend_post_id)
) tablespace pg_default;

create index if not exists idx_seed_posts_review_status
  on public.seed_posts using btree (review_status) tablespace pg_default;

create index if not exists idx_seed_posts_ready_for_backend
  on public.seed_posts using btree (ready_for_backend) tablespace pg_default;

create index if not exists idx_seed_posts_source_type
  on public.seed_posts using btree (source_type) tablespace pg_default;

create index if not exists idx_seed_posts_source_post_id
  on public.seed_posts using btree (source_post_id) tablespace pg_default;

create index if not exists idx_seed_posts_created_at
  on public.seed_posts using btree (created_at) tablespace pg_default;

create index if not exists idx_seed_posts_status
  on public.seed_posts using btree (status) tablespace pg_default;

create index if not exists idx_seed_posts_user_id
  on public.seed_posts using btree (user_id) tablespace pg_default;

create table if not exists public.seed_asset (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  source_type public.seed_source_type not null default 'instagram'::seed_source_type,
  source_url text null,
  source_domain text null,
  source_author text null,
  archived_url text null,
  storage_bucket text null,
  storage_path text null,
  image_hash text not null,
  mime_type text null,
  width integer null,
  height integer null,
  file_size_bytes bigint null,
  captured_at timestamp with time zone null,
  ingested_at timestamp with time zone not null default now(),
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint seed_asset_pkey primary key (id),
  constraint seed_asset_image_hash_key unique (image_hash),
  constraint seed_asset_post_id_fkey
    foreign key (post_id) references public.seed_posts (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_seed_asset_source_type
  on public.seed_asset using btree (source_type) tablespace pg_default;

create index if not exists idx_seed_asset_captured_at
  on public.seed_asset using btree (captured_at) tablespace pg_default;

create table if not exists public.seed_spots (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  backend_spot_id uuid null,
  source_image_id uuid null,
  user_id uuid null,
  position_left text not null,
  position_top text not null,
  subcategory_id uuid null,
  status character varying not null default 'open',
  review_status public.seed_review_status not null default 'draft'::seed_review_status,
  ready_for_backend boolean not null default false,
  approved_by text null,
  approved_at timestamp with time zone null,
  exported_to_backend_at timestamp with time zone null,
  export_error text null,
  metadata jsonb null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint seed_spots_pkey primary key (id),
  constraint seed_spots_backend_spot_id_key unique (backend_spot_id),
  constraint seed_spots_post_id_fkey
    foreign key (post_id) references public.seed_posts (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_seed_spots_post_id
  on public.seed_spots using btree (post_id) tablespace pg_default;

create index if not exists idx_seed_spots_user_id
  on public.seed_spots using btree (user_id) tablespace pg_default;

create index if not exists idx_seed_spots_status
  on public.seed_spots using btree (status) tablespace pg_default;

create index if not exists idx_seed_spots_review_status
  on public.seed_spots using btree (review_status) tablespace pg_default;

create index if not exists idx_seed_spots_ready_for_backend
  on public.seed_spots using btree (ready_for_backend) tablespace pg_default;

create table if not exists public.seed_solutions (
  id uuid not null default gen_random_uuid(),
  spot_id uuid not null,
  backend_solution_id uuid null,
  user_id uuid null,
  match_type character varying null,
  title character varying not null,
  original_url text null,
  affiliate_url text null,
  thumbnail_url text null,
  description text null,
  accurate_count integer not null default 0,
  different_count integer not null default 0,
  is_verified boolean not null default false,
  is_adopted boolean not null default false,
  adopted_at timestamp with time zone null,
  click_count integer not null default 0,
  purchase_count integer not null default 0,
  status character varying not null default 'active',
  metadata jsonb null,
  comment text null,
  qna jsonb null,
  keywords jsonb null,
  link_type character varying null default 'other',
  source_type public.seed_source_type not null default 'web'::seed_source_type,
  source_url text null,
  source_domain text null,
  source_author text null,
  review_status public.seed_review_status not null default 'draft'::seed_review_status,
  ready_for_backend boolean not null default false,
  approved_by text null,
  approved_at timestamp with time zone null,
  exported_to_backend_at timestamp with time zone null,
  export_error text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint seed_solutions_pkey primary key (id),
  constraint seed_solutions_backend_solution_id_key unique (backend_solution_id),
  constraint seed_solutions_spot_id_fkey
    foreign key (spot_id) references public.seed_spots (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_seed_solutions_spot_id
  on public.seed_solutions using btree (spot_id) tablespace pg_default;

create index if not exists idx_seed_solutions_user_id
  on public.seed_solutions using btree (user_id) tablespace pg_default;

create index if not exists idx_seed_solutions_match_type
  on public.seed_solutions using btree (match_type) tablespace pg_default;

create index if not exists idx_seed_solutions_is_verified
  on public.seed_solutions using btree (is_verified) tablespace pg_default;

create index if not exists idx_seed_solutions_is_adopted
  on public.seed_solutions using btree (is_adopted) tablespace pg_default;

create index if not exists idx_seed_solutions_review_status
  on public.seed_solutions using btree (review_status) tablespace pg_default;

create index if not exists idx_seed_solutions_ready_for_backend
  on public.seed_solutions using btree (ready_for_backend) tablespace pg_default;
