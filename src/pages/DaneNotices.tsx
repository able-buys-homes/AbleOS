// src/pages/DaneNotices.tsx
// Dane's door onto the same announcements board Zo uses.

import { Link } from "react-router-dom";
import AnnouncementsBoard from "../features/announcements/AnnouncementsBoard";

export function DaneNotices() {
  return (
    <div className="min-h-screen bg-[#F4F6FA] text-[#1A1A2E]">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <Link className="text-[14px] font-semibold text-[#3B82C4]" to="/dane">
          ← Back to the cockpit
        </Link>

        <h1 className="mt-3 text-[26px] font-semibold tracking-[-0.03em]">Announcements</h1>
        <p className="mt-1 text-[15px] text-[#6C7484]">
          What the park sees in the resident portal. Zo writes here too.
        </p>

        <div className="mt-6">
          <AnnouncementsBoard />
        </div>
      </div>
    </div>
  );
}
