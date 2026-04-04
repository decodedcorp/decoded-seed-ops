"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PublicPostArtistOption, PublicPostDashboardRow } from "@/lib/post-images";

type ListResponse = {
  ok: true;
  data: {
    items: PublicPostDashboardRow[];
    limit: number;
    offset: number;
    sort: string;
    artistId: string | null;
  };
};

type ArtistsResponse = {
  ok: true;
  data: { artists: PublicPostArtistOption[] };
};

type SortMode = "priority_asc" | "created_desc";

function normalizeImageUrl(u: string | null): string {
  if (!u) return "";
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}`.toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
}

export function PostImagesDashboardClient() {
  const [items, setItems] = useState<PublicPostDashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("priority_asc");
  const [limit] = useState(320);
  const [offset, setOffset] = useState(0);
  const [artistId, setArtistId] = useState("");
  const [artistOptions, setArtistOptions] = useState<PublicPostArtistOption[]>([]);
  const [artistsError, setArtistsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/post-images/artists");
        const body = (await res.json()) as ArtistsResponse | { ok: false; error: { message: string } };
        if (cancelled) return;
        if (!res.ok || !("ok" in body) || !body.ok) {
          const msg =
            body && typeof body === "object" && "error" in body && body.error
              ? body.error.message
              : `HTTP ${res.status}`;
          setArtistsError(msg);
          return;
        }
        setArtistOptions(body.data.artists);
      } catch {
        if (!cancelled) setArtistsError("아티스트 목록을 불러오지 못했습니다.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = new URL("/api/post-images", window.location.origin);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("offset", String(offset));
      u.searchParams.set("sort", sort);
      if (artistId) {
        u.searchParams.set("artist_id", artistId);
      }
      const res = await fetch(u.toString());
      const body = (await res.json()) as ListResponse | { ok: false; error: { message: string } };
      if (!res.ok || !("ok" in body) || !body.ok) {
        const msg =
          body && typeof body === "object" && "error" in body && body.error
            ? body.error.message
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setItems(body.data.items);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [limit, offset, sort, artistId]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllOnPage = useCallback(() => {
    setSelected(new Set(items.map((i) => i.id)));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
  }, []);

  const deleteSelected = useCallback(async () => {
    const ids = [...selected];
    if (!ids.length) return;
    if (
      !window.confirm(
        `선택한 ${ids.length}개의 public.posts 행을 삭제할까요? 연결된 spots·solutions 등은 DB CASCADE로 함께 제거됩니다. (복구 불가)`,
      )
    ) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/post-images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeleting(false);
    }
  }, [selected, load]);

  const urlDupGroups = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) {
      const k = normalizeImageUrl(i.image_url);
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [items]);

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            Artist
            <select
              value={artistId}
              onChange={(e) => {
                setArtistId(e.target.value);
                setOffset(0);
              }}
              style={{ minWidth: 220, maxWidth: 360 }}
            >
              <option value="">전체</option>
              {artistOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.post_count})
                </option>
              ))}
            </select>
          </label>
          {artistsError ? (
            <span style={{ color: "#b45309", fontSize: 13 }}>{artistsError}</span>
          ) : null}
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            정렬
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as SortMode);
                setOffset(0);
              }}
            >
              <option value="priority_asc">연결 적은 순 (삭제 우선)</option>
              <option value="created_desc">최신 생성 순</option>
            </select>
          </label>
          <span style={{ color: "#64748b", fontSize: 13 }}>
            한 페이지 {limit}개 · spot/solution은 <code>public.spots</code> / <code>public.solutions</code>
          </span>
          <button type="button" onClick={() => void load()} disabled={loading}>
            새로고침
          </button>
          <button type="button" onClick={selectAllOnPage} disabled={loading || !items.length}>
            페이지 전체 선택
          </button>
          <button type="button" onClick={clearSelection} disabled={!selected.size}>
            선택 해제
          </button>
          <button type="button" onClick={() => void deleteSelected()} disabled={!selected.size || deleting}>
            {deleting ? "삭제 중…" : `선택 삭제 (${selected.size})`}
          </button>
          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
            >
              이전 {limit}
            </button>
            <button
              type="button"
              disabled={items.length < limit || loading}
              onClick={() => setOffset((o) => o + limit)}
            >
              다음 {limit}
            </button>
            <span style={{ fontSize: 13, color: "#64748b" }}>offset {offset}</span>
          </div>
        </div>
        {error ? (
          <p style={{ color: "#b91c1c", marginTop: 10, marginBottom: 0 }}>{error}</p>
        ) : null}
      </div>

      {loading && !items.length ? (
        <p>불러오는 중…</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
            gap: 4,
            alignItems: "start",
          }}
        >
          {items.map((row) => {
            const key = normalizeImageUrl(row.image_url);
            const dup = key && (urlDupGroups.get(key) ?? 0) > 1;
            const isSel = selected.has(row.id);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => toggle(row.id)}
                title={`public.posts.id = ${row.id}`}
                style={{
                  position: "relative",
                  display: "block",
                  width: "100%",
                  padding: 0,
                  margin: 0,
                  border: isSel ? "2px solid #2563eb" : "1px solid #e2e8f0",
                  borderRadius: 6,
                  overflow: "hidden",
                  cursor: "pointer",
                  background: "#f1f5f9",
                }}
              >
                {row.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- arbitrary CDN URLs */
                  <img
                    src={row.image_url}
                    alt=""
                    loading="lazy"
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                      verticalAlign: "top",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      color: "#94a3b8",
                      fontWeight: 600,
                    }}
                  >
                    no img
                  </div>
                )}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: 0,
                    padding: "2px 4px",
                    background: "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, transparent 100%)",
                    color: "#fff",
                    fontSize: 9,
                    lineHeight: 1.2,
                    fontWeight: 700,
                    textAlign: "left",
                    pointerEvents: "none",
                  }}
                >
                  spot {row.spot_count} · sol {row.solution_count}
                </div>
                {dup ? (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 2,
                      right: 2,
                      background: "#f97316",
                      color: "#fff",
                      fontSize: 8,
                      fontWeight: 800,
                      padding: "1px 4px",
                      borderRadius: 4,
                      pointerEvents: "none",
                    }}
                  >
                    dup?
                  </div>
                ) : null}
                {isSel ? (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 2,
                      left: 2,
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: "#2563eb",
                      border: "1px solid #fff",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
