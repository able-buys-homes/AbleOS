// src/features/collections/parts.tsx
// The repeated shapes from zo-collections-mock.html, in cockpit tokens.
//
// Layout patterns are ported exactly - lot cards grouped by urgency, all-caps
// section bars, pill status, tag for tenancy type. Only the palette and type
// follow the existing cockpits, so Zo is not switching visual languages
// between /zo/inspect and /zo/collections on the same phone.
import React from "react";

export function money(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type PillTone = "ok" | "late" | "notice" | "filed" | "plan" | "vacant";

const PILL: Record<PillTone, string> = {
  ok: "bg-[#EAF6EE] text-[#166534]",
  late: "bg-[#FDF4E0] text-[#92600A]",
  notice: "bg-[#FBEDEA] text-[#A83A2A]",
  filed: "bg-[#B4462B] text-white",
  plan: "bg-[#EAF1F8] text-[#2A5B8C]",
  vacant: "bg-[#EEF0F3] text-[#6C7484]",
};

export function Pill({
  tone,
  children,
}: {
  tone: PillTone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-[0.05em] ${PILL[tone]}`}
    >
      {children}
    </span>
  );
}

export function SectionBar({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <div className="mt-4 flex items-center justify-between rounded-t-2xl bg-[#1E3A8A] px-4 py-3">
      <span className="text-[12.5px] font-bold uppercase tracking-[0.09em] text-white">
        {title}
      </span>
      {count !== undefined && (
        <span className="text-[12.5px] font-semibold text-[#A9B4CC]">
          {count}
        </span>
      )}
    </div>
  );
}

export function Stack({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-[#E3E5E9] overflow-hidden rounded-b-2xl border border-t-0 border-[#DCE4EE] bg-white">
      {children}
    </div>
  );
}

/** A block of explanation. These sentences are the training - keep the copy. */
export function Note({
  title,
  children,
  stop = false,
}: {
  title?: string;
  children: React.ReactNode;
  stop?: boolean;
}) {
  return (
    <div
      className={`mt-4 rounded-2xl border border-[#DCE4EE] bg-white p-4 text-[14px] leading-relaxed text-[#6C7484] ${
        stop ? "border-l-4 border-l-[#B4462B]" : "border-l-4 border-l-[#1E3A8A]"
      }`}
      style={{ borderRadius: 16 }}
    >
      {title && (
        <b
          className={`mb-1 block text-[14.5px] font-semibold ${
            stop ? "text-[#B4462B]" : "text-[#1B2231]"
          }`}
        >
          {title}
        </b>
      )}
      {children}
    </div>
  );
}

export function Tag({
  hap = false,
  children,
}: {
  hap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`mt-2 inline-block rounded-md px-2 py-1 text-[11.5px] font-semibold ${
        hap ? "bg-[#EAF1F8] text-[#2A5B8C]" : "bg-[#F2F4F7] text-[#6C7484]"
      }`}
    >
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  variant = "plain",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "plain" | "primary" | "navy" | "ghost";
  disabled?: boolean;
}) {
  const styles = {
    plain: "border-[#D5D8DE] bg-white text-[#1B2231]",
    primary: "border-[#B4462B] bg-[#B4462B] text-white",
    navy: "border-[#1E3A8A] bg-[#1E3A8A] text-white",
    ghost: "border-[#EEF0F3] bg-[#EEF0F3] text-[#1E3A8A]",
  }[variant];

  return (
    <button
      className={`min-h-[40px] rounded-[9px] border px-3.5 py-2 text-[14px] font-semibold disabled:opacity-45 ${styles}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Cards used by plans, notices and Raj's queues. */
export function Item({
  title,
  meta,
  lines,
  awaiting = false,
  children,
}: {
  title: string;
  meta?: string;
  lines?: string[];
  awaiting?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`p-4 ${awaiting ? "border-l-4 border-l-[#D97706] bg-[#FFFCF5]" : ""}`}
    >
      <h3 className="text-[16.5px] font-bold tracking-[-0.01em] text-[#0F1E33]">
        {title}
      </h3>
      {meta && <p className="mt-0.5 text-[13px] text-[#6C7484]">{meta}</p>}
      {lines?.length ? (
        <ul className="mt-3 list-disc pl-5 text-[14.5px] text-[#1B2231]">
          {lines.map((l) => (
            <li className="mb-1" key={l}>
              {l}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
    </div>
  );
}

export function Toast({ message, stop }: { message: string; stop?: boolean }) {
  if (!message) return null;

  return (
    <div
      className={`fixed inset-x-4 bottom-24 z-[80] rounded-xl px-4 py-3.5 text-[15px] text-white shadow-lg ${
        stop ? "bg-[#B4462B]" : "bg-[#1E3A8A]"
      }`}
      role="status"
    >
      {message}
    </div>
  );
}
