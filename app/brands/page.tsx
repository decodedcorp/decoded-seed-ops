import { getBrandsSummary } from "@/lib/entities";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const brands = await getBrandsSummary(q);

  return (
    <section>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Brands</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          완료된 brand 엔티티 <strong>{brands.length}</strong>건
        </p>
      </div>

      <div className="card review-table-card">
        <form method="get" className="row" style={{ marginBottom: 12 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="브랜드명/인스타 계정 검색"
            style={{ minWidth: 280 }}
          />
          <button type="submit">검색</button>
          <Link href="/brands">초기화</Link>
        </form>
        <div className="review-table-scroll">
          <table className="review-table">
            <thead>
              <tr>
                <th>logo</th>
                <th>name_en</th>
                <th>name_ko</th>
                <th>primary instagram</th>
                <th>primary label</th>
                <th>updated_at</th>
              </tr>
            </thead>
            <tbody>
              {brands.length === 0 ? (
                <tr>
                  <td colSpan={6}>브랜드 데이터가 없습니다.</td>
                </tr>
              ) : (
                brands.map((brand) => {
                  const username = brand.primary_account_username;
                  const profileUrl = username ? `https://www.instagram.com/${username}/` : null;
                  return (
                    <tr key={brand.id}>
                      <td>
                        {brand.logo_image_url ? (
                          <a href={brand.logo_image_url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={brand.logo_image_url}
                              alt={brand.name_en || brand.name_ko || brand.id}
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
                      <td>{brand.name_en || "-"}</td>
                      <td>{brand.name_ko || "-"}</td>
                      <td>
                        {profileUrl ? (
                          <a href={profileUrl} target="_blank" rel="noreferrer">
                            {username}
                          </a>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>{brand.primary_account_label || "-"}</td>
                      <td>{new Date(brand.updated_at).toLocaleString()}</td>
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
