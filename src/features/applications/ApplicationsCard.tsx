// src/features/applications/ApplicationsCard.tsx
// Applications that have been submitted.
//
// The form used to be a one-way door: Zo filled in thirteen sections, got a
// thank-you screen, and had no way to look at what he had sent. This is where
// he reads it back.
//
// The list deliberately does not carry the identifying details - the endpoint
// leaves them out of it. They arrive only when one application is opened,
// which is also the only moment anybody needs them.

import React from "react";
import { apiFetch } from "../../lib/apiFetch";

type Row = {
  id: string;
  created_at: string;
  status: string;
  applicant_name: string;
  applicant_phone: string;
  lot_number: string | null;
  applying_for: string | null;
  drive_url: string | null;
  drive_error: string | null;
};

const APPLYING_FOR: Record<string, string> = {
  community_home: "A community-owned home",
  lot_only: "Lot only — they own the home",
  rent_to_own: "Rent to own",
};

const STATUS: Record<string, string> = {
  submitted: "Submitted",
  reviewing: "Being reviewed",
  approved: "Approved",
  denied: "Denied",
  withdrawn: "Withdrawn",
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function show(v: unknown) {
  if (v === null || v === undefined || String(v).trim() === "") return "—";
  return String(v);
}

function yesNo(v: unknown) {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Not answered";
}

export function ApplicationsCard() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [problem, setProblem] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [detail, setDetail] = React.useState<any | null>(null);
  const [loadingOne, setLoadingOne] = React.useState(false);
  const [pdfBusy, setPdfBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/applications");
      if (res.status === 401) return;

      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("application/json")) {
        throw new Error("The applications did not come back.");
      }

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error || "Could not load the applications");
      }

      setRows((body?.applications ?? []) as Row[]);
      setProblem("");
    } catch (err) {
      setProblem(
        err instanceof Error ? err.message : "Could not load the applications",
      );
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function openOne(id: string) {
    setLoadingOne(true);
    setProblem("");
    setDetail(null);
    try {
      const res = await apiFetch(
        `/api/applications?id=${encodeURIComponent(id)}`,
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not open it");
      setDetail(body.application);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not open it");
    } finally {
      setLoadingOne(false);
    }
  }

  /**
   * The PDF route needs an Authorization header, so it cannot be a plain
   * link. Fetch it, then hand the browser a blob.
   */
  async function openPdf(id: string) {
    setPdfBusy(true);
    setProblem("");
    try {
      const res = await apiFetch(
        `/api/applications?pdf=${encodeURIComponent(id)}`,
      );
      if (!res.ok) throw new Error("Could not build the PDF");
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Could not open the PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  const failed = (rows ?? []).filter((r) => r.drive_error).length;

  return (
    <>
      <button
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-[#DCE4EE] bg-white px-4 py-4 text-left"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-[16px] font-bold tracking-[-0.01em] text-[#1B2231]">
            Applications taken
          </span>
          <span className="mt-0.5 block text-[13.5px] text-[#6C7484]">
            {rows === null
              ? "Loading…"
              : rows.length === 0
                ? "None yet. One will appear here the moment you submit it."
                : failed > 0
                  ? `${failed} did not reach the Shared Drive`
                  : "Tap to read one back"}
          </span>
        </span>
        <span className="shrink-0 rounded-full bg-[#EEF0F3] px-2.5 py-1 text-[13px] font-bold text-[#1B2231]">
          {rows?.length ?? "…"}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center overflow-hidden bg-[#141A28]/55 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4 sm:py-6"
          onClick={() => {
            setOpen(false);
            setDetail(null);
          }}
        >
          <div
            className="flex h-full max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-[#EEF2F6] shadow-[0_20px_40px_rgba(30,58,138,0.18)] sm:h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-none items-center justify-between gap-3 bg-[#1E3A8A] px-5 py-4 text-white">
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold tracking-[-0.01em]">
                  {detail ? detail.applicant_name : "Applications taken"}
                </h2>
                <div className="mt-0.5 text-[12.5px] text-[#A9B4CC]">
                  {detail
                    ? `Taken ${when(detail.created_at)}`
                    : `${rows?.length ?? 0} on file`}
                </div>
              </div>
              <button
                aria-label={detail ? "Back to the list" : "Close"}
                className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[19px] leading-none"
                onClick={() => {
                  if (detail) setDetail(null);
                  else setOpen(false);
                }}
                type="button"
              >
                {detail ? "‹" : "×"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {problem && (
                <p className="mb-3 text-[15px] text-[#B91C1C]">{problem}</p>
              )}

              {!detail && (
                <div className="flex flex-col gap-2.5">
                  {rows?.length === 0 && (
                    <p className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[15px] text-[#6C7484]">
                      Nothing yet.
                    </p>
                  )}

                  {(rows ?? []).map((r) => (
                    <button
                      className="rounded-2xl border border-[#DCE4EE] bg-white p-4 text-left"
                      key={r.id}
                      onClick={() => openOne(r.id)}
                      type="button"
                    >
                      <div className="text-[16px] font-bold tracking-[-0.01em] text-[#1B2231]">
                        {r.applicant_name}
                      </div>
                      <div className="mt-1 text-[13px] text-[#6C7484]">
                        {r.lot_number ? `Lot ${r.lot_number} · ` : ""}
                        {APPLYING_FOR[r.applying_for ?? ""] ??
                          show(r.applying_for)}{" "}
                        · {STATUS[r.status] ?? r.status}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-[#8A929E]">
                        Taken {when(r.created_at)} · {r.applicant_phone}
                      </div>

                      {/* A failed Drive copy has to be visible here, or
                          somebody goes looking in the folder for a file that
                          was never filed. */}
                      {r.drive_error && (
                        <div className="mt-2 rounded-[9px] border-l-4 border-l-[#D97706] bg-[#FFFCF5] px-3 py-2 text-[12.5px] leading-relaxed text-[#92600A]">
                          Not in the Shared Drive: {r.drive_error}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {loadingOne && (
                <p className="text-[15px] text-[#6C7484]">Opening…</p>
              )}

              {detail && <Detail app={detail} />}
            </div>

            {detail && (
              <div className="flex flex-none gap-2.5 border-t border-[#E3E5E9] bg-white px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5">
                <button
                  className="flex-1 rounded-[10px] bg-[#1E3A8A] px-3.5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
                  disabled={pdfBusy}
                  onClick={() => openPdf(detail.id)}
                  type="button"
                >
                  {pdfBusy ? "Building…" : "Open the PDF"}
                </button>
                {detail.drive_url && (
                  <a
                    className="flex-1 rounded-[10px] border border-[#DCE4EE] bg-white px-3.5 py-2.5 text-center text-[14px] font-semibold text-[#1B2231]"
                    href={detail.drive_url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    In the Shared Drive
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Every field, in the order the form asks for them. */
function Detail({ app }: { app: any }) {
  const d = app?.data ?? {};

  return (
    <div className="flex flex-col gap-3">
      <Block title="What they are applying for">
        <Line
          label="Applying for"
          value={APPLYING_FOR[d.applyingFor] ?? d.applyingFor}
        />
        <Line label="Lot" value={d.lot} />
        <Line label="Date of application" value={d.date} />
        <Line label="Hoped move-in" value={d.moveIn} />
        <Line label="Status" value={STATUS[app.status] ?? app.status} />
      </Block>

      <Block title="Applicant">
        <Person p={d.applicant} />
      </Block>

      {d.coApplicant?.name && (
        <Block title="Co-applicant">
          <Line label="Relationship" value={d.coRelationship} />
          <Person p={d.coApplicant} />
        </Block>
      )}

      {Array.isArray(d.occupants) && d.occupants.length > 0 && (
        <Block title="Everyone else who would live there">
          {d.occupants.map((o: any, i: number) => (
            <Line
              key={i}
              label={`Occupant ${i + 1}`}
              value={`${show(o?.name)} · ${show(o?.relationship)} · age ${show(o?.age)}`}
            />
          ))}
        </Block>
      )}

      <Block title="Where they live now">
        <Residence r={d.current} />
      </Block>

      {d.previous?.address && (
        <Block title="Where they lived before">
          <Residence r={d.previous} />
        </Block>
      )}

      <Block title="Employment">
        <Job j={d.job} />
      </Block>

      {d.coJob?.employer && (
        <Block title="Co-applicant employment">
          <Job j={d.coJob} />
        </Block>
      )}

      {Array.isArray(d.otherIncome) && d.otherIncome.length > 0 && (
        <Block title="Other income">
          {d.otherIncome.map((inc: any, i: number) => (
            <Line
              key={i}
              label={`Source ${i + 1}`}
              value={`${show(inc?.source)} · ${show(inc?.amount)} · to ${show(inc?.recipient)}`}
            />
          ))}
        </Block>
      )}

      {Array.isArray(d.vehicles) && d.vehicles.length > 0 && (
        <Block title="Vehicles">
          {d.vehicles.map((v: any, i: number) => (
            <Line
              key={i}
              label={`Vehicle ${i + 1}`}
              value={`${show(v?.ymm)} · ${show(v?.color)} · plate ${show(v?.plate)}`}
            />
          ))}
        </Block>
      )}

      {Array.isArray(d.pets) && d.pets.length > 0 && (
        <Block title="Pets">
          {d.pets.map((p: any, i: number) => (
            <Line
              key={i}
              label={`Pet ${i + 1}`}
              value={`${show(p?.type)} · ${show(p?.name)} · ${show(p?.weight)} lb · ${p?.fixed ? "fixed" : "not fixed"}`}
            />
          ))}
        </Block>
      )}

      {(d.ownHome?.ymm || d.ownHome?.serial) && (
        <Block title="The home they own">
          <Line label="Year, make, model" value={d.ownHome?.ymm} />
          <Line label="Size" value={d.ownHome?.size} />
          <Line label="Serial number" value={d.ownHome?.serial} />
          <Line label="Lienholder" value={d.ownHome?.lienholder} />
          <Line label="Titled in their name" value={yesNo(d.ownHome?.titled)} />
          <Line label="Transport" value={d.ownHome?.transport} />
          <Line label="Insurance" value={d.ownHome?.insurance} />
        </Block>
      )}

      <Block title="Background">
        <Line label="Ever evicted" value={yesNo(d.background?.evicted)} />
        <Line label="Broken a lease" value={yesNo(d.background?.brokeLease)} />
        <Line label="Bankruptcy" value={yesNo(d.background?.bankruptcy)} />
        <Line label="Felony conviction" value={yesNo(d.background?.felony)} />
        <Line label="Court order" value={yesNo(d.background?.courtOrder)} />
        <Line label="Smokes or vapes" value={yesNo(d.background?.smoke)} />
        {d.backgroundNote && (
          <Line label="Explanation" value={d.backgroundNote} />
        )}
      </Block>

      {Array.isArray(d.references) && d.references.length > 0 && (
        <Block title="References">
          {d.references.map(
            (r: any, i: number) =>
              (r?.name || r?.phone) && (
                <Line
                  key={i}
                  label={`Reference ${i + 1}`}
                  value={`${show(r?.name)} · ${show(r?.relationship)} · ${show(r?.phone)}`}
                />
              ),
          )}
        </Block>
      )}

      <Block title="Emergency contact">
        <Line
          label="Contact"
          value={`${show(d.emergency?.name)} · ${show(d.emergency?.relationship)} · ${show(d.emergency?.phone)}`}
        />
      </Block>

      <Block title="How they heard about us">
        <Line label="Source" value={d.source} />
        {d.sourceOther && <Line label="Detail" value={d.sourceOther} />}
      </Block>

      <Block title="Authorisation and signature">
        <Line label="Certified" value={yesNo(d.certify)} />
        <Line label="Applicant signature" value={d.signature} />
        <Line label="Co-applicant signature" value={d.coSignature} />
        <Line label="Signed" value={d.signDate} />
      </Block>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white">
      <div className="border-b border-[#E3E5E9] bg-[#F7F9FC] px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-[0.05em] text-[#6C7484]">
        {title}
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-[#F1F4F8] py-2 first:border-t-0">
      <span className="shrink-0 text-[13px] text-[#6C7484]">{label}</span>
      <span className="text-right text-[13.5px] font-semibold text-[#1B2231]">
        {show(value)}
      </span>
    </div>
  );
}

function Person({ p }: { p: any }) {
  return (
    <>
      <Line label="Full legal name" value={p?.name} />
      <Line label="Date of birth" value={p?.dob} />
      <Line label="SSN / ITIN last 4" value={p?.ssnLast4} />
      <Line label="Phone" value={p?.phone} />
      <Line label="Email" value={p?.email} />
      <Line label="Licence / ID" value={p?.idNumber} />
    </>
  );
}

function Residence({ r }: { r: any }) {
  return (
    <>
      <Line label="Address" value={r?.address} />
      <Line label="Dates / move-in" value={r?.moveIn} />
      <Line label="Monthly payment" value={r?.payment} />
      <Line label="Rent or own" value={r?.rentOrOwn} />
      <Line label="Reason for leaving" value={r?.reason} />
      <Line label="Landlord" value={r?.landlord} />
      <Line label="Landlord phone" value={r?.landlordPhone} />
      <Line label="Landlord email" value={r?.landlordEmail} />
    </>
  );
}

function Job({ j }: { j: any }) {
  return (
    <>
      <Line label="Employer" value={j?.employer} />
      <Line label="Position" value={j?.position} />
      <Line label="Started" value={j?.start} />
      <Line label="Supervisor" value={j?.supervisor} />
      <Line label="Gross monthly income" value={j?.income} />
      <Line label="Type" value={j?.type} />
    </>
  );
}
