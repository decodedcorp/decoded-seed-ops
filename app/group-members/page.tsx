import Link from "next/link";

import { GroupMembersClient } from "@/components/group-members-client";
import {
  getArtistPickOptionsForGroupMember,
  getGroupMembersByGroup,
  listEligibleGroupsForMemberAdd,
} from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function GroupMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const [groups, groupOptions, artistOptions] = await Promise.all([
    getGroupMembersByGroup(q),
    listEligibleGroupsForMemberAdd(),
    getArtistPickOptionsForGroupMember(),
  ]);

  return (
    <section>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Group Members</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          검증 완료된 group <strong>{groupOptions.length}</strong>개
          {q.trim() ? (
            <>
              {" "}
              · 검색 결과 <strong>{groups.length}</strong>개
            </>
          ) : null}
        </p>
      </div>

      <div className="card review-table-card">
        <form method="get" className="row" style={{ marginBottom: 12 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="그룹명/멤버명/인스타 계정 검색"
            style={{ minWidth: 280 }}
          />
          <button type="submit">검색</button>
          <Link href="/group-members">초기화</Link>
        </form>

        <GroupMembersClient
          initialGroups={groups}
          groupOptions={groupOptions}
          artistOptions={artistOptions}
        />
      </div>
    </section>
  );
}
