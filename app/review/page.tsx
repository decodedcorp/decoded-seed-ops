import { InstagramReviewTable } from "@/components/instagram-review-table";
import { getApprovedGroupOptions, getInstagramAccountsForReview } from "@/lib/instagram-accounts";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const [accounts, groupOptions] = await Promise.all([
    getInstagramAccountsForReview(),
    getApprovedGroupOptions(),
  ]);

  return (
    <section>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Instagram Accounts Review</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          검수 대기 계정 <strong>{accounts.length}</strong>건
        </p>
      </div>
      <InstagramReviewTable initialAccounts={accounts} groupOptions={groupOptions} />
    </section>
  );
}
