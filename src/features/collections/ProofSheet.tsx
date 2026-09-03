// src/features/collections/ProofSheet.tsx
// What was actually served, and the evidence that it was.
//
// This is the record Barrett puts in front of a judge, so it shows exactly
// what exists and says plainly when something does not - a missing location
// reads as "the phone could not find one", never as a blank.
import React from "react";
import { Btn } from "./parts";

type Props = {
  noticeId: string;
  onClose: () => void;
};

export function ProofSheet({ noticeId, onClose }: Props) {
  const [data, setData] = React.useState<any>(null);
  const [problem, setProblem] = React.useState("");

  React.useEffect(() => {
    let live = true;

    fetch(`/api/collections?proof=${encodeURIComponent(noticeId)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body?.error || "Could not load the proof");
        if (live) setData(body);
      })
      .catch((err) => {
        if (live) setProblem(err.message);
      });

    return () => {
      live = false;
    };
  }, [noticeId]);

  const n = data?.notice;

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
          <div>
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">
              Proof of service
            </h2>
            {n?.lots && (
              <div className="mt-0.5 text-[12.5px] text-[#A9B4CC]">
                Lot {n.lots.lot_number} — {n.lots.tenant_name}
              </div>
            )}
          </div>
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
          {problem && <p className="text-[15px] text-[#B91C1C]">{problem}</p>}
          {!data && !problem && (
            <p className="text-[15px] text-[#6C7484]">Loading…</p>
          )}

          {n && (
            <>
              <div className="rounded-[9px] bg-[#F2F4F7] px-3.5 py-3 text-[13.5px] leading-relaxed text-[#6C7484]">
                Posted{" "}
                <b className="text-[#1B2231]">
                  {new Date(n.posted_at).toLocaleString(undefined, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </b>{" "}
                by {n.posted_by}
                <br />
                {n.geo_status === "captured" && n.geo_lat
                  ? `Location ${Number(n.geo_lat).toFixed(4)}, ${Number(n.geo_lng).toFixed(4)}`
                  : "The phone could not find a location when this was posted."}
              </div>

              <div className="mt-4 grid gap-3">
                <Photo
                  label="The door with the notice on it"
                  url={data.wideUrl}
                />
                <Photo label="The notice itself" url={data.closeUrl} />
              </div>

              <div className="mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[14px] text-[#6C7484]">
                <b className="mb-1 block text-[14.5px] text-[#1B2231]">
                  Also on the record
                </b>
                <ul className="list-disc pl-5">
                  <li>
                    Amount at the time it was written — $
                    {Number(n.generated_from_balance).toFixed(2)}
                  </li>
                  <li>
                    {n.certified_tracking
                      ? `Certified mail ${n.certified_tracking}`
                      : "Certified mail not recorded yet"}
                  </li>
                  <li>
                    {n.pha_copy_at
                      ? `Housing authority copy sent ${new Date(n.pha_copy_at).toLocaleDateString()}`
                      : "No housing authority copy — not an assisted household, or not sent yet"}
                  </li>
                  {n.post_note && <li>Noted at the time: {n.post_note}</li>}
                </ul>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-none gap-2.5 border-t border-[#E3E5E9] bg-white px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 [&>button]:flex-1">
          <Btn onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

function Photo({ label, url }: { label: string; url: string | null }) {
  return (
    <div>
      <span className="mb-2 block text-[12px] font-bold uppercase tracking-[0.08em] text-[#8A929E]">
        {label}
      </span>
      {url ? (
        <a href={url} rel="noreferrer" target="_blank">
          <img
            alt={label}
            className="w-full rounded-[11px] border border-[#D5D8DE] object-cover"
            src={url}
          />
        </a>
      ) : (
        <div className="rounded-[11px] border border-[#D5D8DE] bg-white px-4 py-6 text-center text-[14px] text-[#6C7484]">
          This photo is not on the record
        </div>
      )}
    </div>
  );
}

function token() {
  const key = Object.keys(localStorage).find((k) => k.includes("auth-token"));
  if (!key) return "";
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}").access_token ?? "";
  } catch {
    return "";
  }
}
