import { CandidateDetailClient } from "@/components/candidate-detail-client";
import { getAlternativesForCandidate, getCandidateById } from "@/lib/candidates";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [candidate, alternatives] = await Promise.all([
    getCandidateById(id),
    getAlternativesForCandidate(id),
  ]);

  return (
    <section>
      <h1>Candidate Detail</h1>
      <CandidateDetailClient candidate={candidate} alternatives={alternatives} />
    </section>
  );
}
