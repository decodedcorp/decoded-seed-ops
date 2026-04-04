import { PostSpotsSolutionsDashboardClient } from "@/components/post-spots-solutions-dashboard-client";

export const dynamic = "force-dynamic";

export default function PostSpotsPage() {
  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Post · Spots · Solutions</h1>
      <p style={{ color: "#475569", maxWidth: 820, marginBottom: 16 }}>
        <code>public.posts</code>를 고른 뒤 연결된 <code>public.spots</code>와 각 spot의 <code>public.solutions</code>를 봅니다.{" "}
        <strong>spot 삭제</strong>는 해당 spot 행을 지우며, FK CASCADE로 그 spot의 solution 행이 모두 함께 삭제됩니다.{" "}
        <strong>solution 삭제</strong>는 그 solution 행만 제거합니다 (spot 유지). 각 solution의 미리보기는 DB 컬럼 <code>thumbnail_url</code>입니다. solution 삭제 시 votes·click_logs 등 다른 테이블은 DB 정의에 따라 CASCADE될 수 있습니다.{" "}
        <strong>검수 완료 → Prod로 이전</strong>은 서버에 <code>PROD_PUBLIC_SUPABASE_URL</code> / <code>PROD_PUBLIC_SUPABASE_SERVICE_ROLE_KEY</code>가 있을 때, 선택한 post 단위로{" "}
        <code>post_magazines</code>(있으면) → <code>posts</code> → 관련 <code>magazines</code>·<code>magazine_posts</code> → <code>subcategories</code>(spot이 참조 시) → <code>spots</code> → <code>solutions</code>를 Prod에 upsert합니다.
      </p>
      <PostSpotsSolutionsDashboardClient />
    </section>
  );
}
