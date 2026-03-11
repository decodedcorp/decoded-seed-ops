import { CandidateDetailClient } from "@/components/candidate-detail-client";
import {
  getAlternativesForCandidate,
  getCandidateById,
  getGroupArtistOptionsForCandidate,
} from "@/lib/candidates";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [candidate, alternatives, groupArtistOptions] = await Promise.all([
    getCandidateById(id),
    getAlternativesForCandidate(id),
    getGroupArtistOptionsForCandidate(id),
  ]);

  return (
    <section>
      <h1>Candidate Detail</h1>
      <CandidateDetailClient
        candidate={candidate}
        alternatives={alternatives}
        groupCandidates={groupArtistOptions.groupCandidates}
        artistCandidates={groupArtistOptions.artistCandidates}
      />
    </section>
  );
}
