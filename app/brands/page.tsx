import { getBrandsSummary } from "@/lib/entities";
import Link from "next/link";
import { BrandsTableClient } from "@/components/brands-table-client";

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
        <BrandsTableClient initialBrands={brands} />
      </div>
    </section>
  );
}
