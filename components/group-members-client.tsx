"use client";

import { useEffect, useState } from "react";

import type {
  GroupMemberAddArtistOption,
  GroupMemberAddGroupOption,
  GroupMembersByGroup,
} from "@/types";

type Props = {
  initialGroups: GroupMembersByGroup[];
  groupOptions: GroupMemberAddGroupOption[];
  artistOptions: GroupMemberAddArtistOption[];
};

export function GroupMembersClient({ initialGroups, groupOptions, artistOptions }: Props) {
  const [groups, setGroups] = useState(initialGroups);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedArtistId, setSelectedArtistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setGroups(initialGroups);
  }, [initialGroups]);

  async function handleAddMember() {
    if (!selectedGroupId || !selectedArtistId) {
      setMessage("그룹과 아티스트를 선택해 주세요.");
      return;
    }

    const gIdx = groups.findIndex((g) => g.group_id === selectedGroupId);
    if (gIdx >= 0 && groups[gIdx].members.some((m) => m.id === selectedArtistId)) {
      setMessage("이미 해당 그룹에 등록된 멤버입니다.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/group-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: selectedGroupId, artist_id: selectedArtistId }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "멤버 추가에 실패했습니다.");
      }
      const { group_id: gid, member } = json.data as {
        group_id: string;
        member: GroupMembersByGroup["members"][number];
      };

      const visibleIdx = groups.findIndex((g) => g.group_id === gid);
      if (visibleIdx === -1) {
        setMessage("추가되었습니다. 현재 검색 결과에 그룹이 없다면 검색을 초기화해 확인하세요.");
      } else {
        setGroups((prev) => {
          const idx = prev.findIndex((g) => g.group_id === gid);
          if (idx === -1) return prev;
          const g = prev[idx];
          if (g.members.some((m) => m.id === member.id)) return prev;
          const next = [...prev];
          next[idx] = { ...g, members: [...g.members, member] };
          return next;
        });
        setMessage("멤버가 추가되었습니다.");
      }

      setSelectedArtistId("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  if (groups.length === 0 && groupOptions.length === 0) {
    return <div>조건에 맞는 group member 데이터가 없습니다.</div>;
  }

  return (
    <div>
      {groupOptions.length > 0 && artistOptions.length > 0 ? (
        <div
          className="row"
          style={{
            marginBottom: 16,
            flexWrap: "wrap",
            gap: 8,
            alignItems: "flex-end",
            padding: 12,
            background: "#f8fafc",
            borderRadius: 8,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>그룹</span>
            <select
              className="review-select"
              style={{ minWidth: 220 }}
              value={selectedGroupId}
              disabled={busy}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">선택</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label} (@{g.group_username})
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>아티스트</span>
            <select
              className="review-select"
              style={{ minWidth: 260 }}
              value={selectedArtistId}
              disabled={busy}
              onChange={(e) => setSelectedArtistId(e.target.value)}
            >
              <option value="">선택</option>
              {artistOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void handleAddMember()}>
            {busy ? "추가 중…" : "멤버 추가"}
          </button>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <div style={{ color: "#64748b" }}>
          검색 결과에 표시된 그룹이 없습니다. 멤버는 위에서 추가할 수 있습니다.
        </div>
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
                            <a
                              href={`https://www.instagram.com/${member.username}/`}
                              target="_blank"
                              rel="noreferrer"
                            >
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
      {message ? <p className="review-feedback">{message}</p> : null}
    </div>
  );
}
