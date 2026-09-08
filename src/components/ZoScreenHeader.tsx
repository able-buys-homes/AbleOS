// src/components/ZoScreenHeader.tsx
// The header every screen in Zo's cockpit uses.
//
// It exists because there were five of these, written separately, and they had
// already drifted: the notification bell was only on Rehab, the title sizes
// differed, and the property name appeared on some screens and not others. A
// header that changes shape as you move between tabs makes one app feel like
// several, and Zo stops trusting that he is where he thinks he is.

import React from "react";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";

export function ZoScreenHeader({
  eyebrow,
  title,
  subtitle,
  stat,
  back,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** One line of live numbers, on screens that have any. */
  stat?: React.ReactNode;
  /** Replaces the logo on a screen you arrived at from somewhere else. */
  back?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        {back ?? (
          <img
            alt="Able Buys Homes"
            className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
            src="/able-logo.png"
          />
        )}
        <div className="flex items-center gap-3">
          <NotificationBell />
          <UserMenu />
        </div>
      </div>

      <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
        {eyebrow}
      </p>
      <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
        {title}
      </h1>
      <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
        {subtitle}
      </p>
      {stat && (
        <p className="mt-3 text-[15px] font-semibold text-white">{stat}</p>
      )}
    </>
  );
}
