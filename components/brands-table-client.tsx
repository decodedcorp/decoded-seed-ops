"use client";

import { useState } from "react";

import type { BrandSummary } from "@/types";

type Props = {
  initialBrands: BrandSummary[];
};

export function BrandsTableClient({ initialBrands }: Props) {
  const [brands, setBrands] = useState(initialBrands);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addNameEn, setAddNameEn] = useState("");
  const [addNameKo, setAddNameKo] = useState("");
  const [addFile, setAddFile] = useState<File | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  async function handleAddBrand() {
    if (!addFile) {
      setMessage("로고 이미지를 선택해 주세요.");
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
      const res = await fetch("/api/brands", { method: "POST", body: fd });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "브랜드 추가에 실패했습니다.");
      }
      const row = json.data as BrandSummary;
      setBrands((prev) => [row, ...prev]);
      setAddNameEn("");
      setAddNameKo("");
      setAddFile(null);
      setShowAdd(false);
      setMessage("브랜드가 추가되었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setAddBusy(false);
    }
  }

  async function handleReverify(brandId: string) {
    setBusyId(brandId);
    setMessage(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/reverify`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "재검증 처리에 실패했습니다.");
      }
      setBrands((prev) => prev.filter((brand) => brand.id !== brandId));
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
          {showAdd ? "추가 폼 닫기" : "브랜드 추가"}
        </button>
        {showAdd ? (
          <span style={{ color: "#64748b", fontSize: 14 }}>로고 이미지 필수 (JPEG / PNG / WebP)</span>
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
            <span style={{ fontSize: 12, color: "#64748b" }}>로고 이미지</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={addBusy}
              onChange={(e) => setAddFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="button" disabled={addBusy} onClick={() => void handleAddBrand()}>
            {addBusy ? "저장 중…" : "저장"}
          </button>
        </div>
      ) : null}
      <div className="review-table-scroll">
      <table className="review-table">
        <thead>
          <tr>
            <th>logo</th>
            <th>name_en</th>
            <th>name_ko</th>
            <th>primary instagram</th>
            <th>primary label</th>
            <th>updated_at</th>
            <th className="align-right">action</th>
          </tr>
        </thead>
        <tbody>
          {brands.length === 0 ? (
            <tr>
              <td colSpan={7}>브랜드 데이터가 없습니다.</td>
            </tr>
          ) : (
            brands.map((brand) => {
              const username = brand.primary_account_username;
              const profileUrl = username ? `https://www.instagram.com/${username}/` : null;
              return (
                <tr key={brand.id}>
                  <td>
                    {brand.logo_image_url ? (
                      <a href={brand.logo_image_url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={brand.logo_image_url}
                          alt={brand.name_en || brand.name_ko || brand.id}
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
                  <td>{brand.name_en || "-"}</td>
                  <td>{brand.name_ko || "-"}</td>
                  <td>
                    {profileUrl ? (
                      <a href={profileUrl} target="_blank" rel="noreferrer">
                        {username}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{brand.primary_account_label || "-"}</td>
                  <td>{new Date(brand.updated_at).toLocaleString()}</td>
                  <td className="align-right">
                    <button
                      disabled={busyId === brand.id}
                      onClick={() => handleReverify(brand.id)}
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
