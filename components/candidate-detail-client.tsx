"use client";

import { useState } from "react";

import type { AlternativeImage, SeedLook } from "@/types";

type Props = {
  candidate: SeedLook;
  alternatives: AlternativeImage[];
  groupCandidates: string[];
  artistCandidates: string[];
};

export function CandidateDetailClient({
  candidate,
  alternatives,
  groupCandidates,
  artistCandidates,
}: Props) {
  const [urlInput, setUrlInput] = useState(candidate.source_url ?? "");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [groupNameInput, setGroupNameInput] = useState(candidate.group_name ?? "");
  const [artistNameInput, setArtistNameInput] = useState(candidate.artist_name ?? "");
  const [uploadName, setUploadName] = useState("");
  const [uploadB64, setUploadB64] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function request(path: string, body?: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "Request failed");
      }
      setMessage("성공했습니다. 최신 상태를 반영하려면 새로고침하세요.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessage(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>{candidate.id}</h2>
      <p>Status: {candidate.review_status}</p>
      {/* MVP admin view: use native img to preview arbitrary external URLs */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={candidate.image_url}
        alt={`candidate-${candidate.id}`}
        style={{ maxWidth: "100%", width: 360, borderRadius: 8, border: "1px solid #e5e5e5" }}
      />
      <p>
        Image URL:{" "}
        <a href={candidate.image_url} target="_blank" rel="noreferrer">
          {candidate.image_url}
        </a>
      </p>
      <p>Group: {candidate.group_name || "-"}</p>
      <p>Artist: {candidate.artist_name || "-"}</p>

      <h3>Step0) Group/Artist 확정</h3>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={groupNameInput} onChange={(event) => setGroupNameInput(event.target.value)}>
          <option value="">(group 미선택)</option>
          {groupCandidates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <select value={artistNameInput} onChange={(event) => setArtistNameInput(event.target.value)}>
          <option value="">(artist 미선택)</option>
          {artistCandidates.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button
          disabled={busy}
          onClick={() =>
            request(`/api/candidates/${candidate.id}/source/select`, {
              mode: "group_artist",
              groupName: groupNameInput || null,
              artistName: artistNameInput || null,
            })
          }
        >
          Group/Artist 저장
        </button>
      </div>

      <h3>Alternative images (with_items=false)</h3>
      {alternatives.length === 0 ? (
        <p>대체 이미지 없음</p>
      ) : (
        alternatives.map((alt) => (
          <div className="card" key={alt.image_id}>
            <p>ID: {alt.image_id}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={alt.image_url}
              alt={`alternative-${alt.image_id}`}
              style={{ maxWidth: "100%", width: 320, borderRadius: 8, border: "1px solid #e5e5e5" }}
            />
            <p>
              URL:{" "}
              <a href={alt.image_url} target="_blank" rel="noreferrer">
                {alt.image_url}
              </a>
            </p>
            <button
              disabled={busy}
              onClick={() =>
                request(`/api/candidates/${candidate.id}/source/select`, {
                  mode: "alternative",
                  alternativeImageId: alt.image_id,
                })
              }
            >
              이 이미지로 source 확정
            </button>
          </div>
        ))
      )}

      <h3>Step1) URL source 지정 (출처 링크 저장)</h3>
      <div className="row">
        <input
          value={urlInput}
          onChange={(event) => setUrlInput(event.target.value)}
          placeholder="https://..."
          style={{ minWidth: 340 }}
        />
        <button
          disabled={busy || !urlInput}
          onClick={() =>
            request(`/api/candidates/${candidate.id}/source/select`, {
              mode: "url",
              sourceUrl: urlInput,
            })
          }
        >
          출처 URL 저장
        </button>
      </div>

      <h3>Step2) 이미지 확보 (아래 옵션 중 하나 선택)</h3>
      <h4>옵션1) Image URL ingest (scontent 링크 -&gt; ops-seed 저장)</h4>
      <div className="row">
        <input
          value={imageUrlInput}
          onChange={(event) => setImageUrlInput(event.target.value)}
          placeholder="https://scontent-...jpg"
          style={{ minWidth: 340 }}
        />
        <button
          disabled={busy || !imageUrlInput}
          onClick={() =>
            request(`/api/candidates/${candidate.id}/source/select`, {
              mode: "image_url",
              imageUrl: imageUrlInput,
            })
          }
        >
          이미지 URL 적재
        </button>
      </div>

      <h4>옵션2) 파일 업로드 source 지정 (base64 입력 MVP)</h4>
      <div className="row" style={{ marginBottom: 8 }}>
        <input
          value={uploadName}
          onChange={(event) => setUploadName(event.target.value)}
          placeholder="filename.jpg"
        />
      </div>
      <textarea
        value={uploadB64}
        onChange={(event) => setUploadB64(event.target.value)}
        placeholder="base64 string"
        rows={4}
        style={{ width: "100%" }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button
          disabled={busy || !uploadName || !uploadB64}
          onClick={() =>
            request(`/api/candidates/${candidate.id}/source/select`, {
              mode: "upload",
              fileName: uploadName,
              fileBase64: uploadB64,
            })
          }
        >
          업로드로 확정
        </button>
      </div>

      <h3>Review</h3>
      <div className="row">
        <button disabled={busy} onClick={() => request(`/api/candidates/${candidate.id}/approve`)}>
          Approve
        </button>
        <button disabled={busy} onClick={() => request(`/api/candidates/${candidate.id}/reject`)}>
          Reject
        </button>
      </div>

      {message ? <p>{message}</p> : null}
    </div>
  );
}
