"use client";

import { useState } from "react";

import type { ArtistSummary } from "@/types";

type Props = {
  initialArtists: ArtistSummary[];
};

export function ArtistsTableClient({ initialArtists }: Props) {
  const [artists, setArtists] = useState(initialArtists);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addNameEn, setAddNameEn] = useState("");
  const [addNameKo, setAddNameKo] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  async function handleAddArtist() {
    if (!addFile) {
      setMessage("프로필 이미지를 선택해 주세요.");
      return;
    }
    if (!addNameEn.trim() && !addNameKo.trim()) {
      setMessage("name_en 또는 name_ko 중 하나는 입력해 주세요.");
      return;
    }
    setAddBusy(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("name_en", addNameEn.trim());
      fd.append("name_ko", addNameKo.trim());
      fd.append("image", addFile);
      const res = await fetch("/api/artists", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "아티스트 추가에 실패했습니다.");
      }
      const row = json.data as ArtistSummary;
      setArtists((prev) => [row, ...prev]);
      setAddNameEn("");
      setAddNameKo("");
      setAddFile(null);
      setShowAdd(false);
      setMessage("아티스트가 추가되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleReverify(artistId: string) {
    setBusyId(artistId);
    setMessage(null);
    try {
      const res = await fetch(`/api/artists/${artistId}/reverify`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "재검증 처리에 실패했습니다.");
      }
      setArtists((prev) => prev.filter((artist) => artist.id !== artistId));
      setMessage("재검증 요청이 반영되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12, flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "추가 폼 닫기" : "아티스트 추가"}
        </button>
        {showAdd ? (
          <span style={{ color: "#64748b", fontSize: 14 }}>프로필 이미지 필수 (JPEG / PNG / WebP)</span>
        ) : null}
      </div>
      {showAdd ? (
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
            <span style={{ fontSize: 12, color: "#64748b" }}>name_en</span>
            <input
              className="review-input"
              value={addNameEn}
              disabled={addBusy}
              onChange={(e) => setAddNameEn(e.target.value)}
              placeholder="영문명"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>name_ko</span>
            <input
              className="review-input"
              value={addNameKo}
              disabled={addBusy}
              onChange={(e) => setAddNameKo(e.target.value)}
              placeholder="한글명"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>프로필 이미지</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={addBusy}
              onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" disabled={addBusy} onClick={() => void handleAddArtist()}>
            {addBusy ? "저장 중…" : "저장"}
          </button>
        </div>
      ) : null}
      <div className="review-table-scroll">
      <table className="review-table">
        <thead>
          <tr>
            <th>profile</th>
            <th>name_en</th>
            <th>name_ko</th>
            <th>group</th>
            <th>primary instagram</th>
            <th>primary label</th>
            <th>updated_at</th>
            <th className="align-right">action</th>
          </tr>
        </thead>
        <tbody>
          {artists.length === 0 ? (
            <tr>
              <td colSpan={8}>아티스트 데이터가 없습니다.</td>
            </tr>
          ) : (
            artists.map((artist) => {
              const username = artist.primary_account_username;
              const profileUrl = username ? `https://www.instagram.com/${username}/` : null;
              return (
                <tr key={artist.id}>
                  <td>
                    {artist.profile_image_url ? (
                      <a href={artist.profile_image_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={artist.profile_image_url}
                          alt={artist.name_en || artist.name_ko || artist.id}
                          width={44}
                          height={44}
                          className="review-avatar"
                          style={{ width: 44, height: 44 }}
                        />
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{artist.name_en || "-"}</td>
                  <td>{artist.name_ko || "-"}</td>
                  <td>{artist.group_names.length ? artist.group_names.join(", ") : "-"}</td>
                  <td>
                    {profileUrl ? (
                      <a href={profileUrl} target="_blank" rel="noreferrer">
                        {username}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{artist.primary_account_label || "-"}</td>
                  <td>{new Date(artist.updated_at).toLocaleString()}</td>
                  <td className="align-right">
                    <button
                      disabled={busyId === artist.id}
                      onClick={() => handleReverify(artist.id)}
                      style={{ borderColor: "#ef4444", color: "#b91c1c" }}
                    >
                      재검증
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
      {message ? <p className="review-feedback">{message}</p> : null}
    </div>
  );
}
