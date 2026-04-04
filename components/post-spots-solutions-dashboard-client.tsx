"use client";

import { useCallback, useEffect, useState } from "react";

import type { PublicPostArtistOption } from "@/lib/post-images";
import type { PostForSpotsListRow, PostSpotSolutionTree } from "@/lib/post-spots-solutions";

type PostsListResponse = {
  ok: true;
  data: {
    items: PostForSpotsListRow[];
    limit: number;
    offset: number;
    artistId: string | null;
    prodPostIdCount: number;
    hidingProd: boolean;
  };
};

type TreeResponse = { ok: true; data: PostSpotSolutionTree };

type ArtistsResponse = {
  ok: true;
  data: { artists: PublicPostArtistOption[] };
};

/** DB text → CSS position (숫자만이면 %, 0~1이면 비율, 이미 %/px 등이면 그대로) */
function spotCoordToCss(value: string | null): string | null {
  if (value == null) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (/[%pxem]$/i.test(v)) return v;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return null;
  if (n >= 0 && n <= 1) return `${n * 100}%`;
  return `${n}%`;
}

export function PostSpotsSolutionsDashboardClient() {
  const [artistOptions, setArtistOptions] = useState<PublicPostArtistOption[]>([]);
  const [artistId, setArtistId] = useState("");
  const [limit] = useState(80);
  const [offset, setOffset] = useState(0);
  const [posts, setPosts] = useState<PostForSpotsListRow[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [postsListMeta, setPostsListMeta] = useState<{
    hidingProd: boolean;
    prodPostIdCount: number;
  } | null>(null);

  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [tree, setTree] = useState<PostSpotSolutionTree | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [migrateOk, setMigrateOk] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/post-images/artists");
        const body = (await res.json()) as ArtistsResponse | { ok: false; error: { message: string } };
        if (cancelled) return;
        if (res.ok && "ok" in body && body.ok) {
          setArtistOptions(body.data.artists);
        }
      } catch {
        /* optional filter */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(null);
    try {
      const u = new URL("/api/post-spots/posts", window.location.origin);
      u.searchParams.set("limit", String(limit));
      u.searchParams.set("offset", String(offset));
      if (artistId) u.searchParams.set("artist_id", artistId);
      const res = await fetch(u.toString());
      const body = (await res.json()) as PostsListResponse | { ok: false; error: { message: string } };
      if (!res.ok || !("ok" in body) || !body.ok) {
        throw new Error(
          body && typeof body === "object" && "error" in body && body.error
            ? body.error.message
            : `HTTP ${res.status}`,
        );
      }
      setPosts(body.data.items);
      setPostsListMeta({
        hidingProd: body.data.hidingProd,
        prodPostIdCount: body.data.prodPostIdCount,
      });
    } catch (e) {
      setPostsListMeta(null);
      setPostsError(e instanceof Error ? e.message : "목록 로드 실패");
    } finally {
      setPostsLoading(false);
    }
  }, [limit, offset, artistId]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  const loadTree = useCallback(async (postId: string) => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const res = await fetch(`/api/post-spots/posts/${postId}`);
      const body = (await res.json()) as TreeResponse | { ok: false; error: { message: string } };
      if (!res.ok || !("ok" in body) || !body.ok) {
        throw new Error(
          body && typeof body === "object" && "error" in body && body.error
            ? body.error.message
            : `HTTP ${res.status}`,
        );
      }
      setTree(body.data);
      setMigrateOk(null);
    } catch (e) {
      setTree(null);
      setMigrateOk(null);
      setTreeError(e instanceof Error ? e.message : "트리 로드 실패");
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedPostId) {
      setTree(null);
      return;
    }
    void loadTree(selectedPostId);
  }, [selectedPostId, loadTree]);

  const refreshTree = useCallback(() => {
    if (selectedPostId) void loadTree(selectedPostId);
    void loadPosts();
  }, [selectedPostId, loadTree, loadPosts]);

  const deleteSpot = useCallback(
    async (spotId: string) => {
      if (
        !window.confirm(
          "이 spot을 삭제할까요? DB CASCADE로 이 spot에 달린 solution 행이 모두 함께 삭제됩니다.",
        )
      ) {
        return;
      }
      setActionError(null);
      try {
        const res = await fetch(`/api/post-spots/spots/${spotId}`, { method: "DELETE" });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        refreshTree();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "spot 삭제 실패");
      }
    },
    [refreshTree],
  );

  const deleteSolution = useCallback(
    async (solutionId: string) => {
      if (
        !window.confirm(
          "이 solution 행만 삭제할까요? 같은 spot과 다른 solution은 유지됩니다. votes·click_logs 등은 DB CASCADE로 정리될 수 있습니다.",
        )
      ) {
        return;
      }
      setActionError(null);
      try {
        const res = await fetch(`/api/post-spots/solutions/${solutionId}`, { method: "DELETE" });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
        refreshTree();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "solution 삭제 실패");
      }
    },
    [refreshTree],
  );

  const migrateToProd = useCallback(async () => {
    if (!selectedPostId) return;
    if (
      !window.confirm(
        "선택한 post를 Prod(public DB)로 upsert 할까요?\n포함: post_magazines(있으면) → post → 관련 magazines + magazine_posts → spots → solutions (+ spot에 쓰인 subcategories).\n같은 id가 Prod에 있으면 덮어씁니다.",
      )
    ) {
      return;
    }
    setMigrating(true);
    setActionError(null);
    setMigrateOk(null);
    try {
      const res = await fetch("/api/post-spots/migrate-to-prod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: selectedPostId }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const u = body.data?.upserted;
      setMigrateOk(
        `Prod 반영 완료 · post_magazines ${u?.post_magazines ?? 0}, posts ${u?.posts ?? 0}, magazines ${u?.magazines ?? 0}, magazine_posts ${u?.magazine_posts ?? 0}, spots ${u?.spots ?? 0}, solutions ${u?.solutions ?? 0}`,
      );
      void loadPosts();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Prod 이전 실패");
    } finally {
      setMigrating(false);
    }
  }, [selectedPostId, loadPosts]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(280px, 340px) 1fr",
        gap: 16,
        alignItems: "start",
      }}
      className="post-spots-layout"
    >
      <style>{`
        @media (max-width: 900px) {
          .post-spots-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="card" style={{ position: "sticky", top: 12, maxHeight: "min(85vh, 900px)", overflow: "auto" }}>
        <div className="row" style={{ marginBottom: 12, flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            Artist
            <select
              value={artistId}
              onChange={(e) => {
                setArtistId(e.target.value);
                setOffset(0);
                setSelectedPostId(null);
              }}
            >
              <option value="">전체</option>
              {artistOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label} ({a.post_count})
                </option>
              ))}
            </select>
          </label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <button type="button" onClick={() => void loadPosts()} disabled={postsLoading}>
              새로고침
            </button>
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {offset}–{offset + posts.length}
            </span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              disabled={offset === 0 || postsLoading}
              onClick={() => setOffset((o) => Math.max(0, o - limit))}
            >
              이전
            </button>
            <button
              type="button"
              disabled={posts.length < limit || postsLoading}
              onClick={() => setOffset((o) => o + limit)}
            >
              다음
            </button>
          </div>
          {postsListMeta?.hidingProd ? (
            <p style={{ margin: 0, fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
              Prod에 이미 있는 post({postsListMeta.prodPostIdCount.toLocaleString()}개 id)는 목록에서
              제외했습니다.
            </p>
          ) : null}
        </div>
        {postsError ? <p style={{ color: "#b91c1c", fontSize: 13 }}>{postsError}</p> : null}
        {postsLoading && !posts.length ? (
          <p>불러오는 중…</p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {posts.map((p) => {
              const sel = selectedPostId === p.id;
              return (
                <li key={p.id} style={{ marginBottom: 6 }}>
                  <button
                    type="button"
                    onClick={() => setSelectedPostId(p.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: sel ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      background: sel ? "#eff6ff" : "#fff",
                      cursor: "pointer",
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                  >
                    {p.image_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.image_url}
                        alt=""
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: "contain",
                          borderRadius: 6,
                          flexShrink: 0,
                          background: "#e2e8f0",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          background: "#e2e8f0",
                          borderRadius: 6,
                          flexShrink: 0,
                          fontSize: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#64748b",
                        }}
                      >
                        —
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25, wordBreak: "break-word" }}>
                        {p.title || "(제목 없음)"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{p.artist_name || "—"}</div>
                      <div style={{ fontSize: 11, color: "#0f172a", marginTop: 2 }}>
                        spot {p.spot_count} · sol {p.solution_count}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card" style={{ minHeight: 320 }}>
        {actionError ? (
          <p style={{ color: "#b91c1c", marginTop: 0 }}>{actionError}</p>
        ) : null}
        {migrateOk ? (
          <p style={{ color: "#15803d", marginTop: actionError ? 8 : 0, marginBottom: 0 }}>{migrateOk}</p>
        ) : null}
        {!selectedPostId ? (
          <p style={{ color: "#64748b", margin: 0 }}>왼쪽에서 post를 선택하세요.</p>
        ) : treeLoading ? (
          <p>spot / solution 불러오는 중…</p>
        ) : treeError ? (
          <p style={{ color: "#b91c1c" }}>{treeError}</p>
        ) : tree ? (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 20 }}>
              {tree.post.image_url ? (
                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: 520,
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    overflow: "hidden",
                    background: "#f1f5f9",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tree.post.image_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "auto",
                      display: "block",
                      verticalAlign: "top",
                    }}
                  />
                  {tree.spots.map((spot, si) => {
                    const left = spotCoordToCss(spot.position_left);
                    const top = spotCoordToCss(spot.position_top);
                    if (!left || !top) return null;
                    return (
                      <div
                        key={spot.id}
                        title={`Spot #${si + 1} · ${spot.id.slice(0, 8)}… · sol ${spot.solutions.length}`}
                        style={{
                          position: "absolute",
                          left,
                          top,
                          transform: "translate(-50%, -50%)",
                          width: 26,
                          height: 26,
                          borderRadius: "50%",
                          border: "3px solid #fff",
                          background: "rgba(37, 99, 235, 0.92)",
                          boxShadow: "0 1px 6px rgba(0,0,0,0.35)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 800,
                          pointerEvents: "none",
                          zIndex: 2,
                        }}
                      >
                        {si + 1}
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div>
                <h2 style={{ margin: "0 0 6px", fontSize: 18 }}>{tree.post.title || "(제목 없음)"}</h2>
                <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>{tree.post.artist_name || "—"}</p>
                <p style={{ margin: "8px 0 0", fontSize: 12, wordBreak: "break-all", color: "#475569" }}>
                  post id: {tree.post.id}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                  post_magazine_id: {tree.post.post_magazine_id ?? "—"} · magazine_posts 행:{" "}
                  {tree.post.magazine_post_link_count}
                </p>
                <div className="row" style={{ marginTop: 12, gap: 8 }}>
                  <button type="button" disabled={migrating} onClick={() => void migrateToProd()}>
                    {migrating ? "Prod로 이전 중…" : "검수 완료 → Prod로 이전 (이 post 전부)"}
                  </button>
                </div>
              </div>
            </div>

            {tree.spots.length === 0 ? (
              <p style={{ color: "#64748b" }}>이 post에 연결된 spot이 없습니다.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {tree.spots.map((spot, si) => (
                  <div
                    key={spot.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      padding: 14,
                      background: "#fafafa",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 22,
                            height: 22,
                            padding: "0 6px",
                            borderRadius: 999,
                            background: "#2563eb",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 800,
                            marginRight: 8,
                            verticalAlign: "middle",
                          }}
                        >
                          {si + 1}
                        </span>
                        <strong style={{ fontSize: 14 }}>Spot</strong>{" "}
                        <code style={{ fontSize: 11 }}>{spot.id.slice(0, 8)}…</code>
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#64748b" }}>
                          left {spot.position_left ?? "—"} · top {spot.position_top ?? "—"} · subcat{" "}
                          {spot.subcategory_id?.slice(0, 8) ?? "—"} · {spot.status ?? "—"}
                        </span>
                      </div>
                      <button type="button" onClick={() => void deleteSpot(spot.id)}>
                        spot 삭제 (하위 solution 전부)
                      </button>
                    </div>
                    {spot.solutions.length === 0 ? (
                      <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>solution 없음</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                        {spot.solutions.map((sol) => {
                          const previewHref = sol.thumbnail_url || sol.original_url;
                          return (
                            <li
                              key={sol.id}
                              style={{
                                marginBottom: 12,
                                display: "flex",
                                gap: 12,
                                alignItems: "flex-start",
                                padding: 10,
                                background: "#fff",
                                borderRadius: 10,
                                border: "1px solid #e8e8e8",
                              }}
                            >
                              {sol.thumbnail_url ? (
                                <a
                                  href={previewHref ?? undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ flexShrink: 0, lineHeight: 0 }}
                                  title="thumbnail_url (새 탭)"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={sol.thumbnail_url}
                                    alt=""
                                    style={{
                                      width: 72,
                                      height: 72,
                                      objectFit: "cover",
                                      borderRadius: 8,
                                      border: "1px solid #e2e8f0",
                                      display: "block",
                                    }}
                                  />
                                </a>
                              ) : (
                                <div
                                  style={{
                                    width: 72,
                                    height: 72,
                                    flexShrink: 0,
                                    borderRadius: 8,
                                    background: "#f1f5f9",
                                    border: "1px dashed #cbd5e1",
                                    fontSize: 10,
                                    color: "#94a3b8",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    textAlign: "center",
                                    padding: 4,
                                  }}
                                  title="thumbnail_url 없음"
                                >
                                  no thumb
                                </div>
                              )}
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                                  <span style={{ fontWeight: 600, fontSize: 13 }}>{sol.title || "(제목 없음)"}</span>
                                  <code style={{ fontSize: 10 }}>{sol.id.slice(0, 8)}…</code>
                                  <span style={{ fontSize: 12, color: "#64748b" }}>
                                    {sol.status ?? "—"} · {sol.link_type ?? "—"}
                                  </span>
                                  <button type="button" onClick={() => void deleteSolution(sol.id)}>
                                    이 solution만 삭제 (spot 유지)
                                  </button>
                                </div>
                                {sol.original_url ? (
                                  <a
                                    href={sol.original_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontSize: 11, wordBreak: "break-all", display: "block", marginTop: 4 }}
                                  >
                                    {sol.original_url}
                                  </a>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
