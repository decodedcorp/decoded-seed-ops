"use client";

import { useState } from "react";

import type { InstagramReviewAccount } from "@/types";

const ACCOUNT_TYPE_OPTIONS = [
  "artist",
  "group",
  "brand",
  "source",
  "influencer",
  "place",
  "other",
] as const;

type AccountTypeValue = (typeof ACCOUNT_TYPE_OPTIONS)[number];
const ENTITY_IG_ROLE_OPTIONS = ["primary", "regional", "secondary"] as const;
type EntityIgRoleValue = (typeof ENTITY_IG_ROLE_OPTIONS)[number];

type Props = {
  initialAccounts: InstagramReviewAccount[];
};

export function InstagramReviewTable({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function updateAccountField(accountId: string, field: "name_en" | "name_ko", value: string) {
    setAccounts((prev) =>
      prev.map((account) => (account.id === accountId ? { ...account, [field]: value || null } : account)),
    );
  }

  function updateAccountType(accountId: string, value: string) {
    if (!ACCOUNT_TYPE_OPTIONS.includes(value as AccountTypeValue)) return;
    setAccounts((prev) =>
      prev.map((account) => {
        if (account.id !== accountId) return account;
        return { ...account, account_type: value as AccountTypeValue };
      }),
    );
  }

  function updateEntityIgRole(accountId: string, value: string) {
    if (!ENTITY_IG_ROLE_OPTIONS.includes(value as EntityIgRoleValue)) return;
    setAccounts((prev) =>
      prev.map((account) => {
        if (account.id !== accountId) return account;
        return { ...account, entity_ig_role: value as EntityIgRoleValue };
      }),
    );
  }

  async function handleApprove(accountId: string) {
    setBusyId(accountId);
    setMessage(null);

    try {
      const target = accounts.find((account) => account.id === accountId);
      if (!target) throw new Error("Account not found");
      if (!target.account_type || !ACCOUNT_TYPE_OPTIONS.includes(target.account_type as AccountTypeValue)) {
        throw new Error("account_type이 유효하지 않습니다.");
      }

      const res = await fetch(`/api/instagram-accounts/${accountId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_type: target.account_type,
          entity_ig_role: target.entity_ig_role ?? "primary",
          name_en: target.name_en?.trim() || null,
          name_ko: target.name_ko?.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        throw new Error(json.error?.message || "Approval failed");
      }
      setAccounts((prev) => prev.filter((account) => account.id !== accountId));
      setMessage("승인되었습니다.");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      setMessage(msg);
    } finally {
      setBusyId(null);
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="card review-empty-card">
        <p>검수 대기중인 instagram account가 없습니다.</p>
        {message ? <p className="review-feedback">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="card review-table-card">
      <div className="review-table-scroll">
        <table className="review-table">
        <thead>
          <tr>
            <th>account_id</th>
            <th>group_name</th>
            <th>display_name</th>
            <th>name_en</th>
            <th>name_ko</th>
            <th>account_type</th>
            <th>entity_ig_role</th>
            <th>profile image</th>
            <th className="align-right">action</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((account) => {
            const username = account.account_id;
            const instagramUrl = username ? `https://www.instagram.com/${username}/` : null;
            const profileImageUrl = account.profile_image_url;

            return (
              <tr key={account.id}>
                <td className="account-id-cell">
                  {instagramUrl ? (
                    <a href={instagramUrl} target="_blank" rel="noreferrer">
                      {username}
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{account.group_name || "-"}</td>
                <td>{account.display_name || "-"}</td>
                <td>
                  <input
                    value={account.name_en ?? ""}
                    disabled={busyId === account.id}
                    onChange={(event) => updateAccountField(account.id, "name_en", event.target.value)}
                    placeholder="name_en"
                    className="review-input"
                  />
                </td>
                <td>
                  <input
                    value={account.name_ko ?? ""}
                    disabled={busyId === account.id}
                    onChange={(event) => updateAccountField(account.id, "name_ko", event.target.value)}
                    placeholder="name_ko"
                    className="review-input"
                  />
                </td>
                <td>
                  <select
                    value={account.account_type ?? "other"}
                    disabled={busyId === account.id}
                    onChange={(event) => updateAccountType(account.id, event.target.value)}
                    className="review-select"
                  >
                    {ACCOUNT_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={account.entity_ig_role ?? "primary"}
                    disabled={busyId === account.id}
                    onChange={(event) => updateEntityIgRole(account.id, event.target.value)}
                    className="review-select"
                  >
                    {ENTITY_IG_ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {profileImageUrl ? (
                    <a href={profileImageUrl} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={profileImageUrl}
                        alt={`${username || account.id} profile`}
                        width={56}
                        height={56}
                        className="review-avatar"
                      />
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="align-right">
                  <button
                    className="review-approve-button"
                    disabled={busyId === account.id}
                    onClick={() => handleApprove(account.id)}
                  >
                    승인
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {message ? <p className="review-feedback">{message}</p> : null}
    </div>
  );
}
