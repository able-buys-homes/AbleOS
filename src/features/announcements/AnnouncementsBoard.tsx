// src/features/announcements/AnnouncementsBoard.tsx
// What the office tells the park.
//
// One component, mounted in both Dane's and Zo's cockpits. Two copies would
// drift apart inside a month, and then the park would be told two different
// things depending on who happened to be at the desk.
//
// This writes to announcements, never to notices. That table is legal
// eviction paperwork with proof of posting and belongs nowhere near this.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../lib/apiFetch";

export type Category = "urgent" | "billing" | "maintenance" | "community" | "admin";

type Announcement = {
  id: string;
  category: Category;
  title: string;
  body: string;
  pinned: boolean;
  publish_at: string;
  expires_on: string | null;
  created_by: string;
  updated_by: string | null;
  archived_at: string | null;
  emailed_at: string | null;
};

const CATEGORY_LABEL: Record<Category, string> = {
  urgent: "Urgent",
  billing: "Billing",
  maintenance: "Maintenance",
  community: "Community",
  admin: "Admin",
};

/** Said plainly, so nobody has to guess which one to pick. */
const CATEGORY_HINT: Record<Category, string> = {
  urgent: "Pinned to the top and expires in a week. Water off, gas smell, road closed.",
  billing: "Rent, fees, payment dates.",
  maintenance: "Planned work. Usually has a date on it.",
  community: "Events, reminders, news.",
  admin: "Office notices: hours, policies, lease paperwork.",
};

const CATEGORY_TONE: Record<Category, string> = {
  urgent: "border-[#E9B8B2] bg-[#FDE7E5] text-[#B3261E]",
  billing: "border-[#C9D7EE] bg-[#E8F0FC] text-[#1E4C8A]",
  maintenance: "border-[#E5D3A8] bg-[#FBF3DE] text-[#8A6A16]",
  community: "border-[#B7E2CC] bg-[#E6F5EC] text-[#1B7A4B]",
  admin: "border-[#CBD2E1] bg-[#EEF0F6] text-[#3B4B6B]",
};

/** Dates a resident would recognise, in the park's own timezone. */
const parkDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(iso))
    : "";

const input =
  "w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[15px] text-[#1B2231] outline-none focus:border-[#7FA3D8]";

const label = "mb-1.5 block text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]";

export default function AnnouncementsBoard() {
  const [rows, setRows] = useState<Announcement[] | null>(null);
  const [reach, setReach] = useState<{ withEmail: number; residents: number } | null>(null);
  const [canWrite, setCanWrite] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [category, setCategory] = useState<Category>("community");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [expiresOn, setExpiresOn] = useState("");

  const load = useCallback(async () => {
    setProblem(null);

    const res = await apiFetch("/api/announcements");
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setProblem(data?.error ?? "Could not load the board");
      return;
    }

    setRows(data.announcements ?? []);
    setReach(data.reach ?? null);
    setCanWrite(Boolean(data.canWrite));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const reset = () => {
    setCategory("community");
    setTitle("");
    setBody("");
    setPinned(false);
    setPublishAt("");
    setExpiresOn("");
  };

  const publish = async () => {
    if (busy) return;

    setBusy(true);
    setProblem(null);

    const res = await apiFetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        title: title.trim(),
        body: body.trim(),
        pinned,
        publishAt: publishAt ? new Date(publishAt).toISOString() : undefined,
        expiresOn: expiresOn || undefined,
      }),
    });

    const data = await res.json().catch(() => null);
    setBusy(false);

    if (!res.ok) {
      setProblem(data?.error ?? "Could not post that");
      return;
    }

    reset();
    setOpen(false);
    await load();
  };

  const patch = async (id: string, change: Record<string, unknown>) => {
    setProblem(null);

    const res = await apiFetch(`/api/announcements?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setProblem(data?.error ?? "Could not change that");
      return;
    }

    await load();
  };

  const visible = useMemo(
    () => (rows ?? []).filter((r) => (showArchived ? r.archived_at : !r.archived_at)),
    [rows, showArchived],
  );

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(
    new Date(),
  );

  return (
    <div className="space-y-4">
      {problem && (
        <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] text-[#B91C1C]">
          {problem}
        </div>
      )}

      {/* What an email would actually reach. Saying "everyone" when it is
          four people would stop anyone chasing the other thirty-two. */}
      {reach && (
        <p className="text-[13.5px] text-[#6C7484]">
          {reach.withEmail === 0
            ? `No resident has given us an email address yet, so announcements appear in the portal only. ${reach.residents} have accounts.`
            : `An announcement emails ${reach.withEmail} of ${reach.residents} residents — the rest see it in the portal only.`}
        </p>
      )}

      {canWrite && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-[#1B2231] px-4 py-2.5 text-[15px] font-semibold text-white"
        >
          Write an announcement
        </button>
      )}

      {canWrite && open && (
        <div className="space-y-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
          <div>
            <span className={label}>What kind</span>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABEL) as Category[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                    category === key
                      ? CATEGORY_TONE[key]
                      : "border-[#DCE4EE] bg-white text-[#6C7484]"
                  }`}
                >
                  {CATEGORY_LABEL[key]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-[#6C7484]">{CATEGORY_HINT[category]}</p>
          </div>

          <div>
            <label className={label} htmlFor="ann-title">
              Title
            </label>
            <input
              id="ann-title"
              className={input}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Water off on Smith Lane, Tuesday morning"
            />
          </div>

          <div>
            <label className={label} htmlFor="ann-body">
              What people need to know
            </label>
            <textarea
              id="ann-body"
              className={`${input} min-h-[140px] resize-y`}
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Leave a blank line between paragraphs.\n\nSay what is happening, when, and what they should do."}
            />
            <p className="mt-1.5 text-[12.5px] text-[#8A929E]">
              A blank line starts a new paragraph. {4000 - body.length} characters left.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="ann-publish">
                Post it (leave blank for now)
              </label>
              <input
                id="ann-publish"
                type="datetime-local"
                className={input}
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </div>
            <div>
              <label className={label} htmlFor="ann-expires">
                Take it down after
              </label>
              <input
                id="ann-expires"
                type="date"
                className={input}
                min={today}
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
              <p className="mt-1.5 text-[12.5px] text-[#8A929E]">
                {category === "urgent"
                  ? "Urgent notices come down after a week unless you set a date."
                  : "Leave blank to keep it up until you archive it."}
              </p>
            </div>
          </div>

          <label className="flex items-start gap-2.5 text-[14px] text-[#1B2231]">
            <input
              type="checkbox"
              className="mt-1"
              checked={pinned || category === "urgent"}
              disabled={category === "urgent"}
              onChange={(e) => setPinned(e.target.checked)}
            />
            <span>
              Keep it at the top
              {category === "urgent" && (
                <span className="text-[#6C7484]"> — urgent notices always are</span>
              )}
            </span>
          </label>

          {/* What the resident will actually see. Cheap, and it stops the
              embarrassing ones going out. */}
          {(title.trim() || body.trim()) && (
            <div className="rounded-xl border border-[#DCE4EE] bg-[#FAF7F2] p-4">
              <p className="mb-2 text-[12px] font-bold uppercase tracking-[0.05em] text-[#8A929E]">
                What the resident sees
              </p>
              <span
                className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${CATEGORY_TONE[category]}`}
              >
                {CATEGORY_LABEL[category]}
              </span>
              <p className="mt-2 text-[17px] font-semibold text-[#1B2231]">
                {title.trim() || "Untitled"}
              </p>
              {body
                .trim()
                .split(/\n\s*\n/)
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i} className="mt-2 text-[14px] leading-relaxed text-[#4A5261]">
                    {p}
                  </p>
                ))}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || title.trim().length < 3 || body.trim().length < 3}
              onClick={publish}
              className="rounded-xl bg-[#1B7A4B] px-4 py-2.5 text-[15px] font-semibold text-white disabled:bg-[#B7D6C4]"
            >
              {busy ? "Posting…" : publishAt ? "Schedule it" : "Post it now"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              className="rounded-xl border border-[#DCE4EE] bg-white px-4 py-2.5 text-[15px] font-semibold text-[#4A5261]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowArchived(false)}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
            showArchived ? "border-[#DCE4EE] bg-white text-[#6C7484]" : "border-[#1B2231] bg-[#1B2231] text-white"
          }`}
        >
          On the board
        </button>
        <button
          type="button"
          onClick={() => setShowArchived(true)}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
            showArchived ? "border-[#1B2231] bg-[#1B2231] text-white" : "border-[#DCE4EE] bg-white text-[#6C7484]"
          }`}
        >
          Archived
        </button>
      </div>

      {!rows && <p className="text-[15px] text-[#6C7484]">Loading…</p>}

      {rows && visible.length === 0 && (
        <p className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">
          {showArchived ? "Nothing archived." : "Nothing on the board."}
        </p>
      )}

      <div className="space-y-3">
        {visible.map((a) => {
          const scheduled = new Date(a.publish_at) > new Date();
          const expired = a.expires_on ? a.expires_on < today : false;

          return (
            <div key={a.id} className="rounded-2xl border border-[#DCE4EE] bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] ${CATEGORY_TONE[a.category]}`}
                >
                  {CATEGORY_LABEL[a.category]}
                </span>
                {a.pinned && (
                  <span className="rounded-full border border-[#DCE4EE] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#6C7484]">
                    Pinned
                  </span>
                )}
                {scheduled && (
                  <span className="rounded-full border border-[#C9D7EE] bg-[#E8F0FC] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#1E4C8A]">
                    Goes up {parkDate(a.publish_at)}
                  </span>
                )}
                {expired && !a.archived_at && (
                  <span className="rounded-full border border-[#DCE4EE] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#8A929E]">
                    Expired
                  </span>
                )}
              </div>

              <p className="mt-2 text-[17px] font-semibold text-[#1B2231]">{a.title}</p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed text-[#4A5261]">
                {a.body}
              </p>

              <p className="mt-3 text-[12.5px] text-[#8A929E]">
                {a.created_by} · posted {parkDate(a.publish_at)}
                {a.expires_on ? ` · down after ${parkDate(a.expires_on)}` : ""}
                {a.emailed_at ? " · emailed" : " · not emailed yet"}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {!a.archived_at && (
                  <button
                    type="button"
                    onClick={() => void patch(a.id, { pinned: !a.pinned })}
                    className="rounded-lg border border-[#DCE4EE] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#4A5261]"
                  >
                    {a.pinned ? "Unpin" : "Pin to top"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void patch(a.id, { archived: !a.archived_at })}
                  className="rounded-lg border border-[#DCE4EE] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#4A5261]"
                >
                  {a.archived_at ? "Put it back" : "Take it down"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
