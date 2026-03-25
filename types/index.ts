/** warehouse.seed_posts.status (SCHEMA.md) */
export type SeedPostStatus = "draft" | "approved" | "queued" | "published" | "failed";

export type SeedLook = {
  id: string;
  source_post_id: string | null;
  source_image_id: string | null;
  image_url: string;
  media_source: Record<string, unknown> | null;
  context: string | null;
  group_account_id: string | null;
  artist_account_id: string | null;
  group_label: string | null;
  artist_label: string | null;
  status: SeedPostStatus;
  publish_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type AlternativeImage = {
  image_id: string;
  image_url: string;
  image_hash: string;
};

export type GroupArtistAccountOption = {
  id: string;
  label: string;
};

export type GroupArtistOptions = {
  groupCandidates: GroupArtistAccountOption[];
  artistCandidates: GroupArtistAccountOption[];
};

export type InstagramReviewAccount = {
  id: string;
  account_id: string | null;
  group_account_id: string | null;
  group_name: string | null;
  display_name: string | null;
  name_en: string | null;
  name_ko: string | null;
  account_type: string | null;
  entity_ig_role: "primary" | "regional" | "secondary" | null;
  profile_image_url: string | null;
  needs_review: boolean | null;
  brand_id: string | null;
  artist_id: string | null;
};

export type GroupOption = {
  id: string;
  label: string;
};

export type BrandSummary = {
  id: string;
  name_en: string | null;
  name_ko: string | null;
  logo_image_url: string | null;
  primary_instagram_account_id: string | null;
  primary_account_username: string | null;
  primary_account_label: string | null;
  created_at: string;
  updated_at: string;
};

export type ArtistSummary = {
  id: string;
  name_en: string | null;
  name_ko: string | null;
  profile_image_url: string | null;
  primary_instagram_account_id: string | null;
  primary_account_username: string | null;
  primary_account_label: string | null;
  group_names: string[];
  created_at: string;
  updated_at: string;
};

export type GroupMemberSummary = {
  id: string;
  username: string | null;
  display_name: string | null;
  name_en: string | null;
  name_ko: string | null;
  account_type: string | null;
  profile_image_url: string | null;
};

export type GroupMembersByGroup = {
  group_id: string;
  group_username: string | null;
  group_label: string;
  members: GroupMemberSummary[];
};
