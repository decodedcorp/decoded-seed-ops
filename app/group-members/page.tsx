import Link from "next/link";

import { getGroupMembersByGroup } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function GroupMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const groups = await getGroupMembersByGroup(q);

  return (
    <section>
      <div className="card" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Group Members</h1>
        <p style={{ margin: 0, color: "#475569" }}>
          검증 완료된 group <strong>{groups.length}</strong>개
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

        {groups.length === 0 ? (
          <div>조건에 맞는 group member 데이터가 없습니다.</div>
        ) : (
          groups.map((group) => (
            <div key={group.group_id} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ marginTop: 0 }}>
                {group.group_label}
                {group.group_username ? (
                  <>
                    {" "}
                    (
                    <a href={`https://www.instagram.com/${group.group_username}/`} target="_blank" rel="noreferrer">
                      {group.group_username}
                    </a>
                    )
                  </>
                ) : null}
              </h3>
              <div className="review-table-scroll">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>profile</th>
                      <th>username</th>
                      <th>display_name</th>
                      <th>name_en</th>
                      <th>name_ko</th>
                      <th>account_type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.members.length === 0 ? (
                      <tr>
                        <td colSpan={6}>멤버가 없습니다.</td>
                      </tr>
                    ) : (
                      group.members.map((member) => (
                        <tr key={`${group.group_id}:${member.id}`}>
                          <td>
                            {member.profile_image_url ? (
                              <a href={member.profile_image_url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={member.profile_image_url}
                                  alt={member.display_name || member.username || member.id}
                                  width={40}
                                  height={40}
                                  className="review-avatar"
                                  style={{ width: 40, height: 40 }}
                                />
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            {member.username ? (
                              <a href={`https://www.instagram.com/${member.username}/`} target="_blank" rel="noreferrer">
                                {member.username}
                              </a>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>{member.display_name || "-"}</td>
                          <td>{member.name_en || "-"}</td>
                          <td>{member.name_ko || "-"}</td>
                          <td>{member.account_type || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
