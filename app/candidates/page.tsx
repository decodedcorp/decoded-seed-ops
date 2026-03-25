import Link from "next/link";

import { getCandidatesByStatus } from "@/lib/candidates";

export const dynamic = "force-dynamic";

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const { account = "" } = await searchParams;
  const candidates = await getCandidatesByStatus("draft", account);

  return (
    <section>
      <h1>Draft Candidates</h1>
      <form action="/api/candidates/build" method="post" style={{ marginBottom: 16 }}>
        <button type="submit">후보 생성 실행</button>
      </form>
      <form method="get" className="card" style={{ marginBottom: 16 }}>
        <div className="row">
          <label htmlFor="account">Account filter</label>
          <input
            id="account"
            name="account"
            defaultValue={account}
            placeholder="e.g. blackpinkk.style"
            style={{ minWidth: 260 }}
          />
          <button type="submit">필터 적용</button>
          <Link href="/candidates">초기화</Link>
        </div>
      </form>
      {candidates.length === 0 ? (
        <div className="card">조건에 맞는 draft 후보가 없습니다.</div>
      ) : (
        candidates.map((candidate) => (
          <div className="card" key={candidate.id} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary CDN / Instagram URLs */}
            <a href={`/candidates/${candidate.id}`} style={{ flexShrink: 0 }}>
              <img
                src={candidate.image_url}
                alt={`Seed candidate ${candidate.id.slice(0, 8)}`}
                width={120}
                height={120}
                style={{
                  width: 120,
                  height: 120,
                  objectFit: "cover",
                  borderRadius: 8,
                  border: "1px solid #e5e5e5",
                  display: "block",
                }}
              />
            </a>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p>ID: {candidate.id}</p>
              <p>Group: {candidate.group_label || candidate.group_account_id || "-"}</p>
              <p>Post: {candidate.source_post_id || "-"}</p>
              <p style={{ wordBreak: "break-all" }}>
                Image:{" "}
                <a href={candidate.image_url} target="_blank" rel="noreferrer">
                  {candidate.image_url}
                </a>
              </p>
              <p>Status: {candidate.status}</p>
              <Link href={`/candidates/${candidate.id}`}>상세 보기</Link>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
