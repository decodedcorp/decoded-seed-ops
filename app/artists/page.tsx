import { getArtistsSummary } from "@/lib/entities";
import Link from "next/link";

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
        <div className="review-table-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>profile</th>
                <th>name_en</th>
                <th>name_ko</th>
                <th>group</th>
                <th>primary instagram</th>
                <th>primary label</th>
                <th>updated_at</th>
              </tr>
            </thead>
            <tbody>
              {artists.length === 0 ? (
                <tr>
                  <td colSpan={7}>아티스트 데이터가 없습니다.</td>
                </tr>
              ) : (
                artists.map((artist) => {
                  const username = artist.primary_account_username;
                  const profileUrl = username ? `https://www.instagram.com/${username}/` : null;
                  return (
                    <tr key={artist.id}>
                      <td>
                        {artist.profile_image_url ? (
                          <a href={artist.profile_image_url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={artist.profile_image_url}
                              alt={artist.name_en || artist.name_ko || artist.id}
                              width={44}
                              height={44}
                              className="review-avatar"
                              style={{ width: 44, height: 44 }}
                            />
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{artist.name_en || "-"}</td>
                      <td>{artist.name_ko || "-"}</td>
                      <td>{artist.group_names.length ? artist.group_names.join(", ") : "-"}</td>
                      <td>
                        {profileUrl ? (
                          <a href={profileUrl} target="_blank" rel="noreferrer">
                            {username}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{artist.primary_account_label || "-"}</td>
                      <td>{new Date(artist.updated_at).toLocaleString()}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
