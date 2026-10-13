// src/components/CrmLinkCard.tsx
// T-15 AHTX CRM link (Dev #18, 13 Oct 2026). One link to the AHTX CRM Google Sheet, shown
// on Ellery's, Rex's and Manita's cockpits. Opening it needs the person's own
// Google access to the sheet - the cockpit holds no login for it.
import { ExternalLinkIcon } from "lucide-react";

export const AHTX_CRM_URL =
  "https://docs.google.com/spreadsheets/d/1JvvQ9hzbBuhTgeO-PGBEnfdHW1y20biPxIhhj0VRLFA/edit";

export function CrmLinkCard({ large = false }: { large?: boolean }) {
  return (
    <a
      className={`flex items-center gap-3 rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_5px_14px_rgba(30,58,138,0.055)] transition-shadow hover:shadow-[0_8px_18px_rgba(30,58,138,0.1)] ${large ? "border-2 px-5 py-5" : "px-4 py-4 sm:px-5"}`}
      href={AHTX_CRM_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <div className="h-9 w-1 shrink-0 rounded-full bg-[#16A34A]" />
      <div className="min-w-0 flex-1">
        <p className={`font-semibold leading-snug text-[#1A1A2E] ${large ? "text-[22px]" : "text-[18px]"}`}>
          AHTX CRM
        </p>
        <p className={`text-[#64748B] ${large ? "text-[18px]" : "text-[14px]"}`}>
          Opens the Google Sheet in a new tab
        </p>
      </div>
      <ExternalLinkIcon aria-hidden="true" className="shrink-0 text-[#93A3B8]" size={large ? 20 : 15} strokeWidth={2.5} />
    </a>
  );
}
