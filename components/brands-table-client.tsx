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
      {message ? <p className="review-feedback">{message}</p> : null}
    </div>
  );
}
