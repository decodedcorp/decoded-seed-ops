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
      {message ? <p className="review-feedback">{message}</p> : null}
    </div>
  );
}
