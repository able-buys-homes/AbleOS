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

/** One thing a job is waiting on. A job can be waiting on several. */
export interface Part {
  /** Absent until the row exists on the server. */
  id?: string;
  name: string;
  qty?: number;
  source?: string;
  orderedOn?: string;
  expectedOn?: string;
  /** The day it turned up. Absent means still outstanding. */
  arrivedOn?: string;
}

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
  /**
   * What the job is waiting on. Only meaningful while the status is
   * waiting_parts — a job nobody is waiting on has nothing to record here.
   */
  parts?: Part[];
  /** From the server: the expected date has passed and it is still waiting. */
  partOverdue?: boolean;
  closeout?: {
    fix: string;
    partsCost: number;
    hours: number;
    /** Ties a line on a card statement to the home it was spent on. */
    receiptNumber?: string;
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
  /**
   * Parts travel with the status change, not after it. The server refuses
   * waiting_parts with no part named, so sending them separately would be
   * rejected before the part could ever be recorded.
   */
  onSetStatus: (
    id: string,
    status: JobStatus,
    parts?: Job["parts"],
  ) => Promise<void> | void;
  /** The photo of the problem, uploaded before the job exists. */
  onUploadOpenPhoto: (file: File) => Promise<{ path: string; url: string }>;
  /** A job a notification asked for. It gets opened and shown. */
  openJobId?: string | null;
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

/**
 * "2026-09-12" -> "Sat, Sep 12". A hyphenated date is something you decode;
 * this is something you read.
 */
function niceDate(iso?: string) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  // Built from the parts rather than new Date(iso), which parses as UTC and
  // can land on the day before.
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

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
  openJobId,
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

  // A notification asked for one job. Clear the filter first, or the job it
  // points at can be sitting behind a chip and simply not be there.
  React.useEffect(() => {
    if (!openJobId) return;
    setStatusFilter("all");
    setOpen(openJobId);
  }, [openJobId]);

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

  /**
   * The status Zo has picked but not yet saved. Needed only for waiting on
   * parts: the fields have to appear before the save, or there is nowhere to
   * type the part name the server insists on.
   */
  const [picked, setPicked] = React.useState<Record<string, JobStatus>>({});
  const [parts, setParts] = React.useState<Record<string, Part[]>>({});
  /** Which part card is open, as `${jobId}#${index}`. One at a time. */
  const [openPart, setOpenPart] = React.useState<string | null>(null);

  /**
   * The working list for a job: what Zo has typed, else what is stored, else
   * one blank line ready to fill in. Never an empty list - an empty screen
   * gives nobody anywhere to start.
   */
  const partList = (j: Job): Part[] => {
    const stored = parts[j.id] ?? j.parts ?? [];
    return stored.length > 0 ? stored : [{ name: "" }];
  };

  const writeParts = (j: Job, next: Part[]) =>
    setParts((s) => ({ ...s, [j.id]: next }));

  const editPart = (j: Job, index: number, patch: Partial<Part>) =>
    writeParts(
      j,
      partList(j).map((p, i) => (i === index ? { ...p, ...patch } : p)),
    );

  // en-CA gives YYYY-MM-DD. toISOString would give UTC, which here is
  // tomorrow's date for most of the evening.
  const todayISO = () => new Date().toLocaleDateString("en-CA");

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
        receiptNumber: c.receiptNumber,
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
        receiptNumber: c.receiptNumber,
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

  async function setStatus(
    id: string,
    status: JobStatus,
    withParts?: Job["parts"],
  ) {
    setBusy(id);
    setProblem("");
    try {
      await onSetStatus(id, status, withParts);
      // Dropped only once the server has taken it. Clearing on the way in
      // would snap the card back to its old status mid-save.
      setPicked((s) => {
        const rest = { ...s };
        delete rest[id];
        return rest;
      });
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
    const selected = picked[j.id] ?? j.status;
    const waiting = selected === "waiting_parts";
    const list = partList(j);
    const named = list.filter((p) => p.name.trim().length > 0);

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
            {/* Named on the closed card. "Waiting on parts" by itself tells
                nobody what to chase or who to ring about it. */}
            {j.status === "waiting_parts" && !!j.parts?.length && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-[12.5px] text-[#6C7484]">
                  {/* Says what is still outstanding, not how much was ever
                      ordered. A part already sitting in the truck is not what
                      is holding the job up. */}
                  {(() => {
                    const out = j.parts.filter((p) => !p.arrivedOn);
                    if (out.length === 0) return "All parts arrived";
                    const due = out
                      .map((p) => p.expectedOn)
                      .filter(Boolean)
                      .sort()[0];
                    const who =
                      out.length === 1
                        ? out[0].name
                        : `${out[0].name} +${out.length - 1} more`;
                    return `Waiting on ${who}${due ? ` · due ${niceDate(due)}` : ""}`;
                  })()}
                </span>
                {j.parts.length > 1 && (
                  <span className="text-[12.5px] text-[#8A929E]">
                    {j.parts.filter((p) => p.arrivedOn).length} of{" "}
                    {j.parts.length} arrived
                  </span>
                )}
                {j.partOverdue && (
                  <span className="rounded-full border border-[#E9B8B2] bg-[#FDE7E5] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#B3261E]">
                    Part overdue
                  </span>
                )}
              </div>
            )}
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
              onChange={(e) => {
                const next = e.target.value as JobStatus;
                // Held locally until the part is named. The server refuses it
                // otherwise, and Zo would be told off for leaving blank a
                // field he has not been shown yet.
                if (next === "waiting_parts") {
                  setPicked((s) => ({ ...s, [j.id]: next }));
                  setProblem("");
                  return;
                }
                setPicked((s) => {
                  const rest = { ...s };
                  delete rest[j.id];
                  return rest;
                });
                setStatus(j.id, next);
              }}
              value={selected}
            >
              {/* Waiting on parts sits right under New: it is the other thing
                  that can be true the moment a job is opened, before anyone
                  has been assigned or started. */}
              {(
                [
                  "new",
                  "waiting_parts",
                  "assigned",
                  "in_progress",
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

            {/* Waiting on parts replaces the close-out rather than sitting
                beside it. A job that cannot be worked has nothing to put in
                "what did you fix", and an empty box invites an invented
                answer. */}
            {waiting && (
              <>
                <Label>What are you waiting on?</Label>

                <div className="space-y-2">
                  {list.map((p, i) => {
                    const key = `${j.id}#${i}`;
                    const isPartOpen = openPart === key;
                    const here = !!p.arrivedOn;

                    return (
                      <div
                        className="overflow-hidden rounded-[10px] border border-[#DCE4EE] bg-white"
                        key={key}
                      >
                        <button
                          aria-expanded={isPartOpen}
                          className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
                          onClick={() => setOpenPart(isPartOpen ? null : key)}
                          type="button"
                        >
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-[17px] font-semibold ${
                                !p.name.trim()
                                  ? "text-[#8A929E]"
                                  : here
                                    ? "text-[#8A929E] line-through"
                                    : "text-[#1B2231]"
                              }`}
                            >
                              {p.name.trim() || "New part — tap to fill in"}
                            </span>
                            <span className="mt-0.5 block truncate text-[14px] text-[#6C7484]">
                              {[
                                p.qty ? `${p.qty} needed` : "",
                                p.source ? `from ${p.source}` : "",
                                here
                                  ? `arrived ${niceDate(p.arrivedOn)}`
                                  : p.expectedOn
                                    ? `due ${niceDate(p.expectedOn)}`
                                    : "",
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Tap to add the details"}
                            </span>
                          </span>
                          {here && (
                            <span className="shrink-0 rounded-full border border-[#B7E2CC] bg-[#E6F5EC] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[#1B7A4B]">
                              Here
                            </span>
                          )}
                          {/* Without this the box gives no sign it opens, and
                              a box that looks like a label does not get
                              tapped. */}
                          <span
                            aria-hidden="true"
                            className="shrink-0 text-[15px] leading-none text-[#8A929E]"
                          >
                            {isPartOpen ? "▴" : "▾"}
                          </span>
                        </button>

                        {isPartOpen && (
                          <div className="border-t border-[#E3E5E9] px-3.5 pb-3.5 pt-1">
                            <Label>What is the part called?</Label>
                            <input
                              className={inputClass}
                              onChange={(e) =>
                                editPart(j, i, { name: e.target.value })
                              }
                              placeholder="Water heater element, 4500W"
                              type="text"
                              value={p.name}
                            />

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="min-w-0">
                                <Label>How many do you need?</Label>
                                <input
                                  className={inputClass}
                                  inputMode="numeric"
                                  min={1}
                                  onChange={(e) =>
                                    editPart(j, i, {
                                      qty:
                                        e.target.value === ""
                                          ? undefined
                                          : Number(e.target.value),
                                    })
                                  }
                                  placeholder="1"
                                  step="1"
                                  type="number"
                                  value={p.qty ?? ""}
                                />
                              </div>
                              <div className="min-w-0">
                                <Label>Who is it coming from?</Label>
                                <input
                                  className={inputClass}
                                  onChange={(e) =>
                                    editPart(j, i, { source: e.target.value })
                                  }
                                  placeholder="Lowe's, Ferguson, online"
                                  type="text"
                                  value={p.source ?? ""}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="min-w-0">
                                <Label>When did you order it?</Label>
                                <input
                                  // iOS gives a date input an intrinsic width
                                  // it will not shrink below. Without these it
                                  // runs off the right edge of the card.
                                  className={`${inputClass} block w-full min-w-0 appearance-none`}
                                  onChange={(e) =>
                                    editPart(j, i, {
                                      orderedOn: e.target.value,
                                    })
                                  }
                                  type="date"
                                  value={p.orderedOn ?? ""}
                                />
                              </div>
                              <div className="min-w-0">
                                <Label>When should it arrive?</Label>
                                <input
                                  className={`${inputClass} block w-full min-w-0 appearance-none`}
                                  onChange={(e) =>
                                    editPart(j, i, {
                                      expectedOn: e.target.value,
                                    })
                                  }
                                  type="date"
                                  value={p.expectedOn ?? ""}
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2.5">
                              <Btn
                                onClick={() =>
                                  editPart(j, i, {
                                    arrivedOn: here ? undefined : todayISO(),
                                  })
                                }
                              >
                                {here ? "Not here after all" : "It's here"}
                              </Btn>
                              <Btn
                                onClick={() => {
                                  writeParts(
                                    j,
                                    list.filter((_, x) => x !== i),
                                  );
                                  setOpenPart(null);
                                }}
                              >
                                Delete this part
                              </Btn>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-2.5">
                  <Btn
                    onClick={() => {
                      writeParts(j, [...list, { name: "" }]);
                      setOpenPart(`${j.id}#${list.length}`);
                    }}
                  >
                    + Add another part
                  </Btn>
                </div>

                {problem && (
                  <p className="mt-3 text-[15px] text-[#B91C1C]">{problem}</p>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2.5">
                  <Btn
                    disabled={busy === j.id || named.length === 0}
                    onClick={() => setStatus(j.id, "waiting_parts", named)}
                    variant="primary"
                  >
                    {busy === j.id ? "Saving…" : "Save the parts list"}
                  </Btn>
                </div>

                {named.length === 0 && (
                  <p className="mt-3 rounded-[9px] border-l-4 border-l-[#B3261E] bg-[#FDF3F2] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#B3261E]">
                    Fill in at least one part — then the Save button turns on.
                  </p>
                )}
              </>
            )}

            {!waiting && (
              <>
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

                <Label>Receipt or invoice # (optional)</Label>
                <input
                  className={inputClass}
                  onChange={(e) =>
                    setD(j.id, { receiptNumber: e.target.value })
                  }
                  placeholder="Optional"
                  type="text"
                  value={c.receiptNumber ?? ""}
                />

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
                      c.photoUrl
                        ? "text-[#1B2231]"
                        : "text-[15px] text-[#6C7484]"
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
                  The photo is what proves the work happened. Nothing can be
                  marked done without one.
                </p>

                {problem && (
                  <p className="mt-3 text-[15px] text-[#B91C1C]">{problem}</p>
                )}

                {/* Says why the button is off. A disabled button with no
                explanation reads as broken, and Zo taps it three times. */}
                {!c.photoUrl && (
                  <p className="mt-3 rounded-[9px] border-l-4 border-l-[#B3261E] bg-[#FDF3F2] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#B3261E]">
                    Add the photo first — then the Done button turns on.
                  </p>
                )}

                <div className="mt-3.5 flex flex-wrap gap-2.5">
                  <Btn disabled={busy === j.id} onClick={() => save(j.id)}>
                    {busy === j.id ? "Saving…" : "Save for later"}
                  </Btn>
                  <Btn
                    disabled={busy === j.id || !c.photoUrl}
                    onClick={() => complete(j.id)}
                    variant="primary"
                  >
                    Done — job finished
                  </Btn>
                </div>
              </>
            )}
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

  // Changing the lot brings that home's recorded resident with it. The field
  // is read-only, so this is the only thing that sets it - the job cannot
  // claim somebody lives there when the roll says nobody does.
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
          <h2 className="text-[17px] font-bold tracking-[-0.01em]">New job</h2>
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

          {/* Read-only. Who lives on a lot is the roll's fact, not something
              retyped here - a name spelled differently on a job is a name the
              two screens disagree about later. It changes on the Map, where
              moving somebody in and out actually happens. */}
          <Label>Who lives there</Label>
          <input
            className={`${inputClass} bg-[#F1F3F6] text-[#6C7484]`}
            readOnly
            type="text"
            value={j.occupantName?.trim() || "Nobody lives here"}
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
            {(["emergency", "urgent", "routine", "cosmetic"] as Priority[]).map(
              (p) => (
                <option key={p} value={p}>
                  {PRIO[p].label}
                </option>
              ),
            )}
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
