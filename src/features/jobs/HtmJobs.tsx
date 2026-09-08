// src/features/jobs/HtmJobs.tsx
// Zo's work-order board.
//
// The layout is the mockup's: priority first, tap a card to open it, the
// close-out fields underneath, and a photo required before anything can be
// called done. The colours, type and spacing are the cockpit's - a screen
// that looks like a different app teaches Zo it is a different app, and he
// stops trusting what it tells him.
//
// The header is not here. It belongs to MobileScreenShell, the same as every
// other screen in Zo's cockpit.

import React from "react";
import { Btn, Stack, money } from "../collections/parts";

export type Priority = "emergency" | "urgent" | "routine" | "cosmetic";
export type JobStatus =
  | "new"
  | "assigned"
  | "in_progress"
  | "waiting_parts"
  | "completed"
  | "cancelled";
export type Category =
  | "plumbing"
  | "electrical"
  | "hvac"
  | "roof"
  | "appliance"
  | "grounds"
  | "other";

export interface Job {
  id: string;
  lot: number;
  title: string;
  resident?: string;
  category: Category;
  priority: Priority;
  status: JobStatus;
  openedAt: string;
  note?: string;
  assignedTo?: string;
  closeout?: {
    fix: string;
    partsCost: number;
    hours: number;
    photoUrl?: string;
    completedAt?: string;
  };
}

export interface NewJobInput {
  lot: number;
  /** What is wrong, as it was said. Its first line becomes the card title. */
  title: string;
  /** Who Zo was told lives there, standing at the door. */
  occupantName?: string;
  category: Category;
  priority: Priority;
  /** The photo of the problem, taken when the job was opened. */
  openedPhotoPath?: string;
}

interface Props {
  jobs: Job[];
  onCreate: (j: NewJobInput) => Promise<void> | void;
  onSaveCloseout: (id: string, c: Job["closeout"]) => Promise<void> | void;
  onComplete: (id: string) => Promise<void> | void;
  onUploadPhoto: (id: string, file: File) => Promise<string>;
  onSetStatus: (id: string, status: JobStatus) => Promise<void> | void;
  /** The photo of the problem, uploaded before the job exists. */
  onUploadOpenPhoto: (file: File) => Promise<{ path: string; url: string }>;
  lots?: Array<{ number: number; tenant?: string }>;
}

// Emergency reads red because it means somebody has no water or no heat.
// Routine is deliberately grey - most of the board should not shout.
const PRIO: Record<Priority, { label: string; chip: string; bar: string }> = {
  emergency: {
    label: "Emergency",
    chip: "bg-[#FDE7E5] text-[#B3261E] border-[#E9B8B2]",
    bar: "#B3261E",
  },
  urgent: {
    label: "Urgent",
    chip: "bg-[#FFF4E5] text-[#92600A] border-[#F0E2C4]",
    bar: "#D97706",
  },
  routine: {
    label: "Routine",
    chip: "bg-[#EEF0F3] text-[#6C7484] border-[#DCE4EE]",
    bar: "#9AA4B2",
  },
  // Below routine on purpose. A scuffed door is worth writing down so it is
  // not forgotten, and worth keeping out of the same bucket as a job somebody
  // is actually waiting on.
  cosmetic: {
    label: "Cosmetic",
    chip: "bg-[#F4F6F9] text-[#8A929E] border-[#E3E8EF]",
    bar: "#C7CFDA",
  },
};

const STATUS: Record<JobStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In progress",
  // Somebody has looked at it and cannot finish. Not the same as untouched,
  // and it must not sit on the board being chased as though it were.
  waiting_parts: "Waiting on parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

const CAT: Record<Category, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  hvac: "Heat / AC",
  roof: "Roof",
  appliance: "Appliance",
  grounds: "Grounds",
  other: "Other",
};

const rank: Record<Priority, number> = {
  emergency: 0,
  urgent: 1,
  routine: 2,
  cosmetic: 3,
};

function ago(iso: string) { 
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

const inputClass =
  "w-full rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-[16px] text-[#1B2231]";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 mt-3.5 text-[12px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
      {children}
    </div>
  );
}

function Chip({ p }: { p: Priority }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.04em] ${PRIO[p].chip}`}
    >
      {PRIO[p].label}
    </span>
  );
}

export default function HtmJobs({
  jobs,
  onCreate,
  onSaveCloseout,
  onComplete,
  onUploadPhoto,
  onSetStatus,
  onUploadOpenPhoto,
  lots,
}: Props) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<"all" | JobStatus>(
    "all",
  );
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState<
    Record<string, Partial<NonNullable<Job["closeout"]>>>
  >({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [problem, setProblem] = React.useState("");

  // Emergencies first, finished last. A board that buries an emergency under
  // a loose porch step is worse than no board.
  const sorted = React.useMemo(
    () =>
      [...jobs].sort((a, b) => {
        const aDone = a.status === "completed" ? 1 : 0;
        const bDone = b.status === "completed" ? 1 : 0;
        return (
          aDone - bDone ||
          rank[a.priority] - rank[b.priority] ||
          +new Date(a.openedAt) - +new Date(b.openedAt)
        );
      }),
    [jobs],
  );

  const visible =
    statusFilter === "all"
      ? sorted
      : sorted.filter((j) => j.status === statusFilter);

  const FILTERS: Array<{ key: "all" | JobStatus; label: string }> = [
    { key: "all", label: `All (${jobs.length})` },
    { key: "new", label: "New" },
    { key: "assigned", label: "Assigned" },
    { key: "in_progress", label: "In progress" },
    { key: "waiting_parts", label: "Waiting on parts" },
    { key: "completed", label: "Completed" },
  ];

  const d = (id: string) =>
    draft[id] ?? jobs.find((j) => j.id === id)?.closeout ?? {};

  // Reads the latest draft inside the updater rather than one captured when
  // the handler was created. Reading a stale copy here can quietly drop the
  // last few keystrokes of what somebody wrote about a repair.
  const setD = (id: string, patch: Partial<NonNullable<Job["closeout"]>>) =>
    setDraft((s) => ({
      ...s,
      [id]: {
        ...(s[id] ?? jobs.find((j) => j.id === id)?.closeout ?? {}),
        ...patch,
      },
    }));

  async function save(id: string) {
    const c = d(id);
    setBusy(id);
    setProblem("");
    try {
      await onSaveCloseout(id, {
        fix: c.fix ?? "",
        partsCost: Number(c.partsCost ?? 0),
        hours: Number(c.hours ?? 0),
        photoUrl: c.photoUrl,
      });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  }

  async function complete(id: string) {
    const c = d(id);

    // Said here as well as on the server, so Zo gets a sentence rather than
    // a rejected request.
    if (!c.fix) {
      setProblem("Say what you fixed — a sentence is enough.");
      return;
    }
    if (!c.photoUrl) {
      setProblem("Add a photo of the finished work before marking it done.");
      return;
    }

    setBusy(id);
    setProblem("");
    try {
      // Save the write-up first. Completing sends only the flag, so without
      // this the server sees a job with no fix recorded and refuses it -
      // correctly, because nothing had been written down yet.
      await onSaveCloseout(id, {
        fix: c.fix ?? "",
        partsCost: Number(c.partsCost ?? 0),
        hours: Number(c.hours ?? 0),
        photoUrl: c.photoUrl,
      });
      await onComplete(id);
      setOpen(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not finish it.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: JobStatus) {
    setBusy(id);
    setProblem("");
    try {
      await onSetStatus(id, status);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not change it.");
    } finally {
      setBusy(null);
    }
  }

  async function photo(id: string, file?: File) {
    if (!file) return;
    setBusy(id);
    setProblem("");
    try {
      const url = await onUploadPhoto(id, file);
      setD(id, { photoUrl: url });
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "The photo did not upload.",
      );
    } finally {
      setBusy(null);
    }
  }

  function row(j: Job) {
    const isOpen = open === j.id;
    const c = d(j.id);
    const finished = j.status === "completed";

    return (
      <div
        className="border-l-4 p-4"
        key={j.id}
        style={{
          borderLeftColor: finished ? "#DCE4EE" : PRIO[j.priority].bar,
        }}
      >
        <button
          aria-expanded={isOpen}
          className="flex w-full items-start gap-3 text-left"
          onClick={() => {
            setOpen(isOpen ? null : j.id);
            setProblem("");
          }}
          type="button"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold tracking-[-0.01em]">
              Lot {j.lot} — {j.title}
            </div>
            <div className="mt-1 text-[13px] text-[#6C7484]">
              {/* "Vacant" rather than a blank. An empty home is a fact worth
                  saying — it changes whose door you knock on. */}
              {j.resident ? `${j.resident} · ` : "Vacant · "}
              {CAT[j.category]} · {STATUS[j.status]}
            </div>
            <div className="mt-0.5 text-[12.5px] text-[#8A929E]">
              Opened {ago(j.openedAt)}
              {j.assignedTo ? ` · ${j.assignedTo} assigned` : ""}
            </div>
          </div>
          {finished ? (
            <span className="shrink-0 rounded-full border border-[#B7E2CC] bg-[#E6F5EC] px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.04em] text-[#1B7A4B]">
              Finished
            </span>
          ) : (
            <Chip p={j.priority} />
          )}
        </button>

        {isOpen && !finished && (
          <div className="mt-3 border-t border-[#E3E5E9] pt-3">
            {j.note && (
              <p className="text-[13.5px] leading-relaxed text-[#1B2231]">
                {j.note}
              </p>
            )}

            <Label>Where is it up to</Label>
            <select
              className={inputClass}
              disabled={busy === j.id}
              onChange={(e) => setStatus(j.id, e.target.value as JobStatus)}
              value={j.status}
            >
              {(
                [
                  "new",
                  "assigned",
                  "in_progress",
                  "waiting_parts",
                ] as JobStatus[]
              ).map((s) => (
                <option key={s} value={s}>
                  {STATUS[s]}
                </option>
              ))}
            </select>
            {/* Completed is not in that list on purpose. A job becomes
                finished by writing what was fixed and attaching the photo,
                never by picking it out of a menu. */}

            <Label>What did you fix?</Label>
            <textarea
              className={`${inputClass} leading-relaxed`}
              onChange={(e) => setD(j.id, { fix: e.target.value })}
              placeholder="A sentence is enough"
              rows={3}
              value={c.fix ?? ""}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <Label>What did parts cost?</Label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  min={0}
                  onChange={(e) =>
                    setD(j.id, {
                      partsCost:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                  placeholder="0.00"
                  step="0.01"
                  type="number"
                  value={c.partsCost ?? ""}
                />
              </div>
              <div className="min-w-0">
                <Label>How many hours?</Label>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  min={0}
                  onChange={(e) =>
                    setD(j.id, {
                      hours:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                    })
                  }
                  placeholder="0.0"
                  step="0.25"
                  type="number"
                  value={c.hours ?? ""}
                />
              </div>
            </div>

            <Label>Photo of the finished work — required</Label>
            <label
              className={`${inputClass} flex cursor-pointer items-center gap-3`}
            >
              <input
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => photo(j.id, e.target.files?.[0])}
                type="file"
              />
              {c.photoUrl ? (
                <img
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  src={c.photoUrl}
                />
              ) : (
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#EEF0F3] text-[12px] font-bold text-[#6C7484]">
                  NONE
                </span>
              )}
              <span
                className={
                  c.photoUrl ? "text-[#1B2231]" : "text-[15px] text-[#6C7484]"
                }
              >
                {c.photoUrl
                  ? "Photo attached — tap to replace"
                  : "Take a photo"}
              </span>
            </label>

            {/* Why the photo is not optional. Raj wrote this rule, not the
                screen: a job marked done with no proof is one nobody can
                check, including Zo when someone says it was never fixed. */}
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#6C7484]">
              The photo is what proves the work happened. Nothing can be marked
              done without one.
            </p>

            {problem && (
              <p className="mt-3 text-[15px] text-[#B91C1C]">{problem}</p>
            )}

            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <Btn disabled={busy === j.id} onClick={() => save(j.id)}>
                {busy === j.id ? "Saving…" : "Save for later"}
              </Btn>
              <Btn
                disabled={busy === j.id}
                onClick={() => complete(j.id)}
                variant="primary"
              >
                Mark it done
              </Btn>
            </div>
          </div>
        )}

        {isOpen && finished && j.closeout && (
          <div className="mt-3 border-t border-[#E3E5E9] pt-3 text-[13.5px] leading-relaxed text-[#6C7484]">
            <div className="text-[#1B2231]">
              <b>Fixed:</b> {j.closeout.fix}
            </div>
            <div className="mt-1">
              Parts {money(j.closeout.partsCost)} · {j.closeout.hours} hr
              {j.closeout.completedAt
                ? ` · closed ${ago(j.closeout.completedAt)}`
                : ""}
            </div>
            {j.closeout.photoUrl && (
              <img
                alt=""
                className="mt-3 max-h-48 w-full rounded-[10px] object-cover"
                src={j.closeout.photoUrl}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="pb-24">
      <p className="text-[14px] leading-relaxed text-[#6C7484]">
        Emergencies are always on top. Tap a job to open it, add the finished
        photo, then mark it done.
      </p>

      {/* Scrolls sideways rather than wrapping to three rows and pushing the
          board off the screen. */}
      <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <button
              aria-pressed={active}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                active
                  ? "border-[#1E3A8A] bg-[#1E3A8A] text-white"
                  : "border-[#DCE4EE] bg-white text-[#1B2231]"
              }`}
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              type="button"
            >
              {f.label}
            </button>
          );
        })}
      </div>

      <Stack>
        {visible.length === 0 && (
          <div className="p-4 text-[15px] text-[#6C7484]">
            {statusFilter === "all"
              ? "Nothing here yet. If a resident has told you about something, open it here so it is not only in your head."
              : "Nothing in this one."}
          </div>
        )}
        {visible.map(row)}
      </Stack>

      <button
        aria-label="Open a new job"
        className="fixed bottom-[92px] right-5 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#1E3A8A] text-[30px] leading-none text-white shadow-[0_6px_16px_rgba(20,26,40,0.28)]"
        onClick={() => setCreating(true)}
        type="button"
      >
        +
      </button>

      {creating && (
        <NewJobSheet
          lots={lots}
          onClose={() => setCreating(false)}
          onUploadPhoto={onUploadOpenPhoto}
          onCreate={async (j) => {
            await onCreate(j);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

function NewJobSheet({
  lots,
  onClose,
  onCreate,
  onUploadPhoto,
}: {
  lots?: Array<{ number: number; tenant?: string }>;
  onClose: () => void;
  onCreate: (j: NewJobInput) => Promise<void> | void;
  onUploadPhoto: (file: File) => Promise<{ path: string; url: string }>;
}) {
  const first = lots?.[0];

  const [j, setJ] = React.useState<NewJobInput>({
    lot: first?.number ?? 1,
    title: "",
    occupantName: first?.tenant ?? "",
    category: "plumbing",
    priority: "routine",
  });
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");

  const ok = j.title.trim().length > 2 && j.lot > 0;

  // Changing the lot brings that home's recorded resident with it, so Zo is
  // correcting a name rather than typing one from nothing - and if the name
  // he is told at the door differs from the record, that difference is kept.
  function pickLot(n: number) {
    const match = lots?.find((l) => l.number === n);
    setJ((s) => ({ ...s, lot: n, occupantName: match?.tenant ?? "" }));
  }

  async function addPhoto(file?: File) {
    if (!file) return;
    setBusy(true);
    setProblem("");
    try {
      const { path, url } = await onUploadPhoto(file);
      setJ((s) => ({ ...s, openedPhotoPath: path }));
      setPhotoUrl(url);
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "The photo did not upload.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#141A28]/55 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-[#F1F2F4] sm:rounded-[18px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between gap-3 bg-[#1E3A8A] px-5 py-4 text-white">
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">
            Open a job
          </h2>
          <button
            aria-label="Close"
            className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[19px] leading-none"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="rounded-[9px] bg-[#E9ECF1] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#4A5464]">
            Open it while you are standing there. A job that lives in your head
            is one nobody else can pick up, and one nobody can prove you were
            told about.
          </div>

          <Label>Which lot</Label>
          {lots && lots.length > 0 ? (
            <select
              className={inputClass}
              onChange={(e) => pickLot(Number(e.target.value))}
              value={j.lot}
            >
              {lots.map((l) => (
                <option key={l.number} value={l.number}>
                  Lot {l.number}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputClass}
              inputMode="numeric"
              onChange={(e) => setJ({ ...j, lot: Number(e.target.value) })}
              type="number"
              value={j.lot}
            />
          )}

          <Label>Who lives there</Label>
          <input
            className={inputClass}
            onChange={(e) => setJ({ ...j, occupantName: e.target.value })}
            placeholder="Name"
            type="text"
            value={j.occupantName ?? ""}
          />

          <Label>What kind of problem</Label>
          <select
            className={inputClass}
            onChange={(e) =>
              setJ({ ...j, category: e.target.value as Category })
            }
            value={j.category}
          >
            {(Object.keys(CAT) as Category[]).map((k) => (
              <option key={k} value={k}>
                {CAT[k]}
              </option>
            ))}
          </select>

          <Label>What is wrong</Label>
          <textarea
            className={`${inputClass} leading-relaxed`}
            onChange={(e) => setJ({ ...j, title: e.target.value })}
            placeholder="Say it like you'd say it out loud"
            rows={3}
            value={j.title}
          />

          <Label>How urgent</Label>
          <select
            className={inputClass}
            onChange={(e) =>
              setJ({ ...j, priority: e.target.value as Priority })
            }
            value={j.priority}
          >
            {(
              ["emergency", "urgent", "routine", "cosmetic"] as Priority[]
            ).map((p) => (
              <option key={p} value={p}>
                {PRIO[p].label}
              </option>
            ))}
          </select>

          <Label>Photo of the problem</Label>
          <label
            className={`${inputClass} flex cursor-pointer items-center gap-3`}
          >
            <input
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => addPhoto(e.target.files?.[0])}
              type="file"
            />
            {photoUrl ? (
              <img
                alt=""
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
                src={photoUrl}
              />
            ) : (
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#EEF0F3] text-[12px] font-bold text-[#6C7484]">
                NONE
              </span>
            )}
            <span
              className={
                photoUrl ? "text-[#1B2231]" : "text-[15px] text-[#6C7484]"
              }
            >
              {photoUrl
                ? "Photo attached — tap to replace"
                : "Tap to add a photo"}
            </span>
          </label>
          {problem && (
            <p className="mt-3 text-[15px] text-[#B91C1C]">{problem}</p>
          )}
        </div>

        <div className="flex flex-none gap-2.5 border-t border-[#E3E5E9] bg-white px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 [&>button]:flex-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn
            disabled={!ok || busy}
            onClick={async () => {
              setBusy(true);
              setProblem("");
              try {
                await onCreate(j);
              } catch (err) {
                setProblem(
                  err instanceof Error ? err.message : "Could not open it.",
                );
              } finally {
                setBusy(false);
              }
            }}
            variant="primary"
          >
            {busy ? "Saving…" : "Save job"}
          </Btn>
        </div>
      </div>
    </div>
  );
}