-- Backend-aligned seed tables for curated cold-start data.
-- Contract target: public.posts / public.spots / public.solutions
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

create table if not exists public.seed_look (
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
  constraint seed_look_pkey primary key (id),
  constraint seed_look_backend_post_id_key unique (backend_post_id)
) tablespace pg_default;

create index if not exists idx_seed_look_review_status
  on public.seed_look using btree (review_status) tablespace pg_default;

create index if not exists idx_seed_look_ready_for_backend
  on public.seed_look using btree (ready_for_backend) tablespace pg_default;

create index if not exists idx_seed_look_source_type
  on public.seed_look using btree (source_type) tablespace pg_default;

create index if not exists idx_seed_look_source_post_id
  on public.seed_look using btree (source_post_id) tablespace pg_default;

create index if not exists idx_seed_look_created_at
  on public.seed_look using btree (created_at) tablespace pg_default;

create index if not exists idx_seed_look_status
  on public.seed_look using btree (status) tablespace pg_default;

create index if not exists idx_seed_look_user_id
  on public.seed_look using btree (user_id) tablespace pg_default;

create table if not exists public.seed_asset (
  id uuid not null default gen_random_uuid(),
  look_id uuid not null,
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
  constraint seed_asset_look_id_fkey
    foreign key (look_id) references public.seed_look (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_seed_asset_source_type
  on public.seed_asset using btree (source_type) tablespace pg_default;

create index if not exists idx_seed_asset_captured_at
  on public.seed_asset using btree (captured_at) tablespace pg_default;

create table if not exists public.seed_item (
  id uuid not null default gen_random_uuid(),
  look_id uuid not null,
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
  constraint seed_item_pkey primary key (id),
  constraint seed_item_backend_spot_id_key unique (backend_spot_id),
  constraint seed_item_look_id_fkey
    foreign key (look_id) references public.seed_look (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_seed_item_look_id
  on public.seed_item using btree (look_id) tablespace pg_default;

create index if not exists idx_seed_item_user_id
  on public.seed_item using btree (user_id) tablespace pg_default;

create index if not exists idx_seed_item_status
  on public.seed_item using btree (status) tablespace pg_default;

create index if not exists idx_seed_item_review_status
  on public.seed_item using btree (review_status) tablespace pg_default;

create index if not exists idx_seed_item_ready_for_backend
  on public.seed_item using btree (ready_for_backend) tablespace pg_default;

create table if not exists public.seed_solution (
  id uuid not null default gen_random_uuid(),
  item_id uuid not null,
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
  constraint seed_solution_pkey primary key (id),
  constraint seed_solution_backend_solution_id_key unique (backend_solution_id),
  constraint seed_solution_item_id_fkey
    foreign key (item_id) references public.seed_item (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_seed_solution_item_id
  on public.seed_solution using btree (item_id) tablespace pg_default;

create index if not exists idx_seed_solution_user_id
  on public.seed_solution using btree (user_id) tablespace pg_default;

create index if not exists idx_seed_solution_match_type
  on public.seed_solution using btree (match_type) tablespace pg_default;

create index if not exists idx_seed_solution_is_verified
  on public.seed_solution using btree (is_verified) tablespace pg_default;

create index if not exists idx_seed_solution_is_adopted
  on public.seed_solution using btree (is_adopted) tablespace pg_default;

create index if not exists idx_seed_solution_review_status
  on public.seed_solution using btree (review_status) tablespace pg_default;

create index if not exists idx_seed_solution_ready_for_backend
  on public.seed_solution using btree (ready_for_backend) tablespace pg_default;
