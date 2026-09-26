// src/pages/ZoNotices.tsx
// Zo's door onto the announcements board. The board itself is shared with
// Dane - one screen, so the park is never told two different things.

import AnnouncementsBoard from "../features/announcements/AnnouncementsBoard";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { ZoScreenHeader } from "../components/ZoScreenHeader";
import { ZoTabBar } from "../components/ZoTabBar";

export function ZoNotices() {
  return (
    <MobileScreenShell
      headerContent={
        <ZoScreenHeader
          eyebrow="Hometown Meadows MHP"
          subtitle="What the park sees in the resident portal."
          title="Announcements"
        />
      }
    >
      <div className="pt-2 pb-24">
        <AnnouncementsBoard />
      </div>

      <ZoTabBar />
    </MobileScreenShell>
  );
}
