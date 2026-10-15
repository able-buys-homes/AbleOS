// src/pages/ZoPaperApplications.tsx
// Upload a paper residency application (photo or PDF). Raj-approved, Coco's
// spec, 15 Oct 2026. Files hold SSNs and ID numbers: they go to a private
// bucket and are only ever opened through a 10-minute link. Zo, Manita and
// Raj only - the server enforces it (routes/paper-applications.js).

import React from "react";
import { useNavigate } from "react-router-dom";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";
import { apiFetch } from "../lib/apiFetch";

const inputClass =
  "w-full rounded-[9px] border border-[#D5D8DE] bg-white px-3.5 py-3 text-[16px] text-[#1B2231] focus:border-[#1E3A8A] focus:outline-none";
const labelClass = "mb-1.5 mt-3 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]";
const btn = (navy = false) =>
  `rounded-[9px] px-4 py-3 text-[15px] font-semibold disabled:opacity-40 ${
    navy ? "bg-[#1E3A8A] text-white" : "border border-[#D5D8DE] bg-white text-[#1B2231]"
  }`;

const parkToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const day = (iso?: string | null) =>
  iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || "Something went wrong");
  return body;
}

type Row = {
  id: string; lot_number: string; last_name: string; taken_on: string; file_name: string;
  status: string; uploaded_by_cockpit: string | null; uploaded_at: string | null;
};

export function ZoPaperApplications() {
  const navigate = useNavigate();
  const [lot, setLot] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [takenOn, setTakenOn] = React.useState(parkToday());
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState("");
  const [done, setDone] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(() => {
    apiFetch("/api/paper-applications")
      .then(json)
      .then((b) => setRows(b.applications ?? []))
      .catch((e) => setProblem(e.message));
  }, []);
  React.useEffect(load, [load]);

  const upload = async () => {
    setProblem(""); setDone("");
    if (!/^\d+$/.test(lot.trim())) return setProblem("Type the lot number, like 12.");
    if (!lastName.trim()) return setProblem("Type the applicant's last name.");
    if (!file) return setProblem("Take a photo or pick the PDF first.");
    setBusy(true);
    try {
      const start = await json(await apiFetch("/api/paper-applications", {
        method: "POST",
        body: JSON.stringify({
          lot_number: lot.trim(), last_name: lastName.trim(), taken_on: takenOn,
          mime_type: file.type, size_bytes: file.size,
        }),
      }));
      const put = await fetch(start.signedUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error(`Upload failed (${put.status}). Check your signal and try again.`);
      await json(await apiFetch("/api/paper-applications?done=1", {
        method: "POST",
        body: JSON.stringify({ id: start.id }),
      }));
      setDone(`Saved as ${start.file_name}. Raj has been told.`);
      setLot(""); setLastName(""); setTakenOn(parkToday()); setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      load();
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  };

  const view = async (id: string) => {
    setProblem("");
    try {
      const b = await json(await apiFetch(`/api/paper-applications?id=${id}`));
      window.open(b.url, "_blank", "noopener,noreferrer");
    } catch (e: any) { setProblem(e.message); }
  };

  return (
    <MobileScreenShell
      headerContent={
        <ZoScreenHeader
          eyebrow="Hometown Meadows MHP"
          subtitle="Photo or PDF of a filled-in paper application. Kept private - it has SSNs and IDs."
          title="Paper applications"
        />
      }
    >
      <div className="pb-28 pt-2">
        {problem && <p className="mt-3 rounded-xl bg-[#FEF2F2] px-4 py-3 text-[15px] text-[#B91C1C]">{problem}</p>}
        {done && <p className="mt-3 rounded-xl bg-[#EAF7EF] px-4 py-3 text-[15px] font-semibold text-[#14532D]">{done}</p>}

        <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="pa-lot">Lot number</label>
              <input className={inputClass} id="pa-lot" inputMode="numeric" onChange={(e) => setLot(e.target.value)} placeholder="e.g. 12" value={lot} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pa-date">Date taken</label>
              <input className={inputClass} id="pa-date" max={parkToday()} onChange={(e) => setTakenOn(e.target.value)} type="date" value={takenOn} />
            </div>
          </div>
          <label className={labelClass} htmlFor="pa-name">Applicant's last name</label>
          <input className={inputClass} id="pa-name" maxLength={60} onChange={(e) => setLastName(e.target.value)} placeholder="e.g. Smith" value={lastName} />

          <label className={labelClass} htmlFor="pa-file">The application</label>
          <input
            accept="application/pdf,image/*"
            className="block w-full text-[15px]"
            id="pa-file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            ref={fileInput}
            type="file"
          />
          <p className="mt-1.5 text-[13px] text-[#8291A5]">One file per upload. Several pages? Upload each photo the same way.</p>

          <button className={`${btn(true)} mt-4 w-full`} disabled={busy} onClick={upload} type="button">
            {busy ? "Uploading..." : "Upload application"}
          </button>
        </section>

        <section className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white">
          <h2 className="px-4 pt-4 text-[13px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">Uploaded</h2>
          {rows === null && <p className="px-4 py-4 text-[15px] text-[#6C7484]">Loading...</p>}
          {rows?.length === 0 && <p className="px-4 py-4 text-[15px] text-[#6C7484]">None yet.</p>}
          <div className="divide-y divide-[#EEF1F5]">
            {(rows ?? []).map((r) => (
              <div className="flex items-center justify-between gap-3 px-4 py-3.5" key={r.id}>
                <div className="min-w-0">
                  <p className="truncate text-[15.5px] font-semibold text-[#1A1A2E]">{r.file_name}</p>
                  <p className="text-[13px] text-[#6C7484]">{r.status} · {day(r.taken_on)}{r.uploaded_by_cockpit ? ` · by ${r.uploaded_by_cockpit}` : ""}</p>
                </div>
                <button className={btn()} onClick={() => view(r.id)} type="button">View</button>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-4">
          <button className={btn()} onClick={() => navigate("/zo/collections")} type="button">Back to Rent</button>
        </div>
      </div>
      <ZoTabBar />
    </MobileScreenShell>
  );
}
