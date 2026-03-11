import Link from "next/link";

import { getCandidatesByStatus } from "@/lib/candidates";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const candidates = await getCandidatesByStatus("draft");

  return (
    <section>
      <h1>Draft Candidates</h1>
      <form action="/api/candidates/build" method="post" style={{ marginBottom: 16 }}>
        <button type="submit">후보 생성 실행</button>
      </form>
      {candidates.length === 0 ? (
        <div className="card">draft 후보가 없습니다.</div>
      ) : (
        candidates.map((candidate) => (
          <div className="card" key={candidate.id}>
            <p>ID: {candidate.id}</p>
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
