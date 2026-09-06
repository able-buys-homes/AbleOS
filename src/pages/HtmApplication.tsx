// src/pages/HtmApplication.tsx
// The residency application, wired to htm_applications.
//
// taken_by is set from the signed-in user because the INSERT policy refuses
// any row claiming someone else took it. If an insert ever fails on that,
// the session has expired - the form is fine.
//
// The form component is left in its own styling for now. It does not match
// the rest of the cockpit yet and that is a known, separate job.
import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "lucide-react";
import { MobileScreenShell } from "../components/MobileScreenShell";
import { UserMenu } from "../components/UserMenu";
import HtmRentalApplication, {
  type Application,
} from "../features/applications/HtmRentalApplication";
import { supabase } from "../lib/supabase";

export function HtmApplication() {
  async function submit(app: Application) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error(
        "You are signed out, so nothing was saved. Sign in again — what you typed is still on screen.",
      );
    }

    // The whole form goes into `data`, identifying details included. That
    // column is why this table has row level security on it.
    const { error } = await supabase.from("htm_applications").insert({
      applicant_name: app.applicant.name,
      applicant_phone: app.applicant.phone,
      lot_number: app.lot || null,
      applying_for: app.applyingFor || null,
      data: app,
      taken_by: user.id,
    });

    if (error) {
      throw new Error(
        `The application was not saved and nothing has been sent. ${error.message}`,
      );
    }
  }

  return (
    <MobileScreenShell
      headerContent={
        <>
          <div className="flex items-center justify-between">
            <Link aria-label="Back to rent" to="/zo/collections">
              <ArrowLeftIcon aria-hidden="true" size={22} />
            </Link>
            <UserMenu />
          </div>

          <h1 className="mt-3 text-[27px] font-bold tracking-[-0.015em]">
            Application for residency
          </h1>
          <p className="mt-1.5 text-[13.5px] text-white/75">
            Hometown Meadows MHP &nbsp;•&nbsp; 121 Smith Lane, Nashville AR
          </p>
        </>
      }
    >
      <HtmRentalApplication onSubmit={submit} />
    </MobileScreenShell>
  );
}