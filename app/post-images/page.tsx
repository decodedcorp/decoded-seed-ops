import { PostImagesDashboardClient } from "@/components/post-images-dashboard-client";

export const dynamic = "force-dynamic";

export default function PostImagesPage() {
  return (
    <section>
      <h1 style={{ marginTop: 0 }}>Public posts (중복 점검)</h1>
      <p style={{ color: "#475569", maxWidth: 720, marginBottom: 16 }}>
        앱 DB <code>public.posts</code> 한 행당 대표 이미지(<code>image_url</code>)를 썸네일로 보여 줍니다. 위에서 <code>artist_id</code>(아티스트)로 좁혀 볼 수 있습니다. 타일을 눌러 선택한 뒤 삭제하면 해당{" "}
        <strong>post 행 전체</strong>가 지워지며, FK CASCADE로 <code>spots</code>·<code>solutions</code> 등 연결 데이터도 함께 삭제됩니다. 오버레이 숫자는{" "}
        <code>public.spots</code> / <code>public.solutions</code> 개수이며, 합이 작을수록 같은 이미지가 중복일 때 삭제 후보로 보기 좋습니다.
      </p>
      <PostImagesDashboardClient />
    </section>
  );
}
