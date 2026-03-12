export type ReviewStatus = "draft" | "approved" | "rejected";

export type SeedLook = {
  id: string;
  source_post_id: string | null;
  source_with_items_image_id: string | null;
  group_name: string | null;
  artist_name: string | null;
  image_url: string;
  title: string | null;
  source_url: string | null;
  source_domain: string | null;
  review_status: ReviewStatus;
  ready_for_backend: boolean;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  exported_to_backend_at: string | null;
  export_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AlternativeImage = {
  image_id: string;
  image_url: string;
  image_hash: string;
};

export type GroupArtistOptions = {
  groupCandidates: string[];
  artistCandidates: string[];
};
