import { getArtistsSummary } from "@/lib/entities";
import Link from "next/link";
import { ArtistsTableClient } from "@/components/artists-table-client";

export const dynamic = "force-dynamic";

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const artists = await getArtistsSummary(q);

  return (
    <section>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Artists</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          완료된 artist 엔티티 <strong>{artists.length}</strong>건
        </p>
      </div>

      <div className="card review-table-card">
        <form method="get" className="row" style={{ marginBottom: 12 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="아티스트명/그룹/인스타 계정 검색"
            style={{ minWidth: 280 }}
          />
          <button type="submit">검색</button>
          <Link href="/artists">초기화</Link>
        </form>
        <ArtistsTableClient initialArtists={artists} />
      </div>
    </section>
  );
}
