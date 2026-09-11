// src/pages/ZoJobs.tsx
// Work orders. The screen itself is HtmJobs, ported from the mockup and left
// in its own styling on purpose - it is a finished design, and converting
// half of it would leave it matching nothing.
//
// This page owns the data, and in particular it owns the photo paths. HtmJobs
// holds a signed preview link so Zo can see what he just photographed, and
// those links expire. The storage path is kept here and sent with the save,
// because writing an expiring URL into the record of a repair would leave a
// completed job whose proof stops loading a week later.

import React from "react";
import HtmJobs, {
  type Category,
  type Job,
  type JobStatus,
  type NewJobInput,
  type Priority,
} from "../features/jobs/HtmJobs";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";
import { useNotificationTarget } from "../lib/useNotificationTarget";

type Row = {
  id: string;
  lot_id: string;
  lot_number: string | null;
  tenant_name: string | null;
  title: string;
  note: string | null;
  category: Category;
  priority: Priority;
  status: JobStatus;
  opened_at: string;
  assigned_to: string | null;
  fix: string | null;
  parts_cost: string | number | null;
  hours: string | number | null;
  photo_path: string | null;
  photo_url?: string | null;
  receipt_number: string | null;
  completed_at: string | null;
  part_name: string | null;
  part_qty: number | null;
  part_source: string | null;
  part_ordered_on: string | null;
  part_expected_on: string | null;
  /** Worked out by the server against the park's calendar, not the browser's. */
  part_overdue?: boolean;
};

type LotRow = { id: string; lot_number: string; tenant_name: string | null };

export function ZoJobs() {
  const [jobs, setJobs] = React.useState<Job[] | null>(null);
  const [lots, setLots] = React.useState<LotRow[]>([]);
  const [problem, setProblem] = React.useState("");

  // jobId -> storage path of the photo just uploaded for it.
  const photoPaths = React.useRef<Record<string, string>>({});

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/jobs");
      if (res.status === 401) return;

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("application/json")) {
        throw new Error(
          "The jobs did not come back. Nothing has been changed. Reload to try again, or tell Dane if it keeps happening.",
        );
      }

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not load the jobs");

      // Only numbered lots go in the picker. 106 Fox Run Rd is on the rent
      // roll but is not one of the numbered homes on this site.
      setLots(
        ((body?.lots ?? []) as LotRow[]).filter((l) =>
          /^\d+$/.test(l.lot_number),
        ),
      );

      setJobs(
        ((body?.jobs ?? []) as Row[]).map((r) => ({
          id: r.id,
          lot: Number(r.lot_number ?? 0),
          title: r.title,
          resident: r.tenant_name ?? undefined,
          category: r.category,
          priority: r.priority,
          status: r.status,
          openedAt: r.opened_at,
          note: r.note ?? undefined,
          assignedTo: r.assigned_to ?? undefined,
          // Only built when a part is actually named. An empty parts object
          // would make every job look like it were waiting on something.
          parts: r.part_name
            ? {
                name: r.part_name,
                qty: r.part_qty ?? undefined,
                source: r.part_source ?? undefined,
                orderedOn: r.part_ordered_on ?? undefined,
                expectedOn: r.part_expected_on ?? undefined,
              }
            : undefined,
          partOverdue: r.part_overdue ?? false, 
          closeout:
            r.fix || r.photo_path || r.parts_cost != null || r.hours != null
              ? {
                  fix: r.fix ?? "",
                  partsCost: Number(r.parts_cost ?? 0),
                  hours: Number(r.hours ?? 0),
                  receiptNumber: r.receipt_number ?? undefined,
                  photoUrl: r.photo_url ?? undefined,
                  completedAt: r.completed_at ?? undefined,
                }
              : undefined,
        })),
      );
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "Could not load the jobs",
      );
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const openCount = (jobs ?? []).filter((j) => j.status !== "completed").length;

  /* Notifications deep-link into here, e.g. /zo/jobs?job=<id> */
  const { clear, target } = useNotificationTarget();
  const [jobTarget, setJobTarget] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!target.job) return;

    // Held until the board has loaded. Opening a job before the list arrives
    // means opening nothing, and the param is gone by the time it does.
    if (!jobs) return;

    setJobTarget(target.job);
    clear();
  }, [clear, jobs, target.job]);

  async function send(path: string, init: RequestInit) {
    const res = await apiFetch(path, init);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Could not save");
    return body;
  }

  async function create(input: NewJobInput) {
    await send("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        lot_number: String(input.lot),
        // The whole paragraph. The server takes its first line as the card's
        // title and keeps the rest, so nothing said at the door is dropped to
        // make a heading fit.
        title: input.title,
        occupant_name: input.occupantName || null,
        opened_photo_path: input.openedPhotoPath || null,
        category: input.category,
        priority: input.priority,
      }),
    });
    await load();
  }

  async function saveCloseout(id: string, c: Job["closeout"]) {
    await send(`/api/jobs?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        fix: c?.fix ?? null,
        parts_cost: c?.partsCost ?? null,
        hours: c?.hours ?? null,
        receipt_number: c?.receiptNumber ?? null,
        // The path, never the signed preview link.
        photo_path: photoPaths.current[id] ?? undefined,
      }),
    });
    await load();
  }

  async function setStatus(
    id: string,
    status: JobStatus,
    parts?: Job["parts"],
  ) {
    await send(`/api/jobs?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        // Sent with the status, because the server will not accept
        // waiting_parts without the part named. Leaving these undefined drops
        // them from the JSON entirely, so moving a job to any other status
        // never wipes what was recorded about a part that did turn up.
        part_name: parts ? parts.name || null : undefined,
        part_qty: parts ? (parts.qty ?? null) : undefined,
        part_source: parts ? parts.source || null : undefined,
        part_ordered_on: parts ? parts.orderedOn || null : undefined,
        part_expected_on: parts ? parts.expectedOn || null : undefined,
      }),
    });
    await load();
  }

  async function complete(id: string) {
    await send(`/api/jobs?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        complete: true,
        photo_path: photoPaths.current[id] ?? undefined,
      }),
    });
    await load();
  }

  /**
   * The photo of the problem, taken before the job exists. Hands back both
   * the stored path - which is what gets saved on the row - and a short-lived
   * link for the preview.
   */
  async function uploadOpenPhoto(file: File) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

    const ticket = await send("/api/jobs?photo=1", {
      method: "POST",
      body: JSON.stringify({ ext, kind: "open" }),
    });

    const put = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

    if (!put.ok) throw new Error(`Photo upload failed (${put.status})`);

    const view = await send(
      `/api/jobs?photo=${encodeURIComponent(ticket.path)}`,
      { method: "GET" },
    );

    return { path: ticket.path as string, url: view.url as string };
  }

  /**
   * Mint a signed URL, PUT the bytes straight into storage, then hand back a
   * short-lived link for the preview. The file never passes through Vercel.
   */
  async function uploadPhoto(id: string, file: File) {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();

    const ticket = await send("/api/jobs?photo=1", {
      method: "POST",
      body: JSON.stringify({ ext }),
    });

    const put = await fetch(ticket.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });

    if (!put.ok) throw new Error(`Photo upload failed (${put.status})`);

    photoPaths.current[id] = ticket.path;

    const view = await send(
      `/api/jobs?photo=${encodeURIComponent(ticket.path)}`,
      { method: "GET" },
    );

    return view.url as string;
  }

  return (
    <MobileScreenShell
      headerContent={
        <>
          <ZoScreenHeader
            eyebrow="Hometown Meadows MHP"
            stat={
              jobs
                ? `${openCount} ${openCount === 1 ? "job" : "jobs"} open`
                : undefined
            }
            subtitle="Work orders for the community. Emergencies first."
            title="Jobs"
          />
        </>
      }
    >
      <div className="pt-2">
        {problem && (
          <div className="rounded-xl bg-[#FEF2F2] px-4 py-3 text-[16px] text-[#B91C1C]">
            {problem}
          </div>
        )}

        {!jobs && !problem && (
          <div className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">
            Loading the jobs…
          </div>
        )}

        {jobs && (
          <HtmJobs
            jobs={jobs}
            lots={lots.map((l) => ({
            number: Number(l.lot_number),
            tenant: l.tenant_name ?? undefined,
          }))}
            onComplete={complete}
            onCreate={create}
            onSaveCloseout={saveCloseout}
                      onSetStatus={setStatus}
          openJobId={jobTarget}
          onUploadOpenPhoto={uploadOpenPhoto}
          onUploadPhoto={uploadPhoto}
          />
        )}
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
