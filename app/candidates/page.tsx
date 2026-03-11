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
          <div className="card" key={candidate.id}>
            <p>ID: {candidate.id}</p>
            <p>Account: {candidate.group_name || "-"}</p>
            <p>Post: {candidate.source_post_id || "-"}</p>
            <p>Image: {candidate.image_url}</p>
            <p>Ready: {String(candidate.ready_for_backend)}</p>
            <Link href={`/candidates/${candidate.id}`}>상세 보기</Link>
          </div>
        ))
      )}
    </section>
  );
}
