import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2Icon } from "lucide-react";
import { ArrowButton } from "./ArrowButton";

const inputClass =
  "w-full rounded-xl border border-brand-ink/10 bg-brand-cream px-4 py-3 text-brand-ink placeholder:text-brand-ink/35 focus:outline-none focus:border-brand-azure focus:ring-[3px] focus:ring-brand-azure/25 transition-[border-color,box-shadow,background-color] duration-200 ease-out";

const labelClass = "font-semibold text-[0.85rem] text-brand-ink/80";

const ease = [0.23, 1, 0.32, 1] as const;

const highlights = [
  "Owners, brokers, and wholesalers all welcome — brokers protected.",
  "Attach rent roll, T12, OM, or photos and we underwrite from real numbers.",
  "Seller financing, subject-to, and hybrid structures all considered.",
  "Formal LOI once the deal clears underwriting.",
];

type LeadFormProps = {
  assetType: string;
  onAssetTypeChange: (value: string) => void;
  nameRef: React.RefObject<HTMLInputElement>;
};

export function LeadForm({
  assetType,
  onAssetTypeChange,
  nameRef,
}: LeadFormProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success">(
    "idle",
  );
  const [error, setError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (files.length === 0) {
      setError("Attach at least one document — rent roll, T12, OM or photos.");
      return;
    }
    setStatus("submitting");
    setError("");
    const form = new FormData(e.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();
    try {
      // Upload first. One token groups the whole submission, and the deal is
      // only created once every file has landed.
      let uploadToken = "";
      for (const file of files) {
        const ticketRes = await fetch("/api/deal-upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: uploadToken || undefined,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
          }),
        });
        const ticket = await ticketRes.json().catch(() => null);
        if (!ticketRes.ok) {
          throw new Error(ticket?.error || "Could not upload that file.");
        }
        uploadToken = ticket.token;
        const put = await fetch(ticket.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!put.ok) throw new Error(`Could not upload ${file.name}.`);
      }
      const res = await fetch("/api/deal-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value("name"),
          email: value("email"),
          phone: value("phone"),
          address: value("property_address"),
          askingPrice: value("asking_price"),
          notes: value("notes"),
          role: value("role"),
          assetType: value("asset_type"),
          currentFinancing: value("current_financing"),
          sellerOpenTo: value("seller_open_to"),
          uploadToken,
          // Hidden from people, catnip to bots.
          website: value("website"),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error || "Something went wrong. Please try again.",
        );
      }

      setStatus("success");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <section
      id="submit"
      className="relative overflow-hidden bg-brand-mist py-24"
    >
      <div className="pointer-events-none absolute -left-40 top-0 h-[520px] w-[620px] animate-drift rounded-full bg-brand-sky/40 blur-[130px]" />

      <div className="relative z-10 mx-auto grid max-w-7xl items-start gap-14 px-6 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45, ease }}
          className="lg:sticky lg:top-28"
        >
          <span className="mb-3 block text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-brand-blue">
            Deal Submission
          </span>
          <h2 className="mb-5 text-4xl font-extrabold leading-[1.05] tracking-[-0.02em] text-brand-ink md:text-[3.1rem]">
            Submit Your Deal
          </h2>
          <p className="mb-10 max-w-[58ch] text-base leading-relaxed text-brand-ink/70 md:text-lg">
            Have a property that fits our criteria? Send the details and attach
            whatever you have — rent roll, T12, OM, photos. It all lands
            directly with our underwriting team, and we respond same day.
          </p>

          <ul className="mb-10 space-y-5">
            {highlights.map((item, i) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ duration: 0.35, delay: i * 0.05, ease }}
                className="flex items-start gap-3.5"
              >
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-brand-blue shadow-[0_6px_16px_-8px_rgba(22,78,124,0.7)]">
                  <CheckCircle2Icon className="h-4 w-4" />
                </span>
                <p className="text-[0.95rem] text-brand-ink/70">{item}</p>
              </motion.li>
            ))}
          </ul>

          <div className="flex items-center gap-3 font-display text-lg font-bold text-brand-deep">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-azure opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-azure" />
            </span>
            We respond same day.
          </div>

          <div className="group mt-10 hidden overflow-hidden rounded-[28px] border border-white shadow-[0_30px_70px_-46px_rgba(22,78,124,0.7)] lg:block">
            <img
              src="/ce6c3d57-01c4-402f-8027-50c1a161eb56.jpg"
              alt="Elegant white villa with a pool and mature palms"
              loading="lazy"
              className="h-[220px] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.15 }}
          transition={{ duration: 0.45, ease }}
          className="rounded-[28px] bg-white p-7 shadow-[0_40px_90px_-50px_rgba(22,78,124,0.75)] sm:p-10"
        >
          {status === "success" ? (
            <div className="py-14 text-center">
              <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-brand-haze">
                <CheckCircle2Icon className="h-10 w-10 text-brand-blue" />
              </div>
              <h3 className="mb-4 text-3xl font-extrabold text-brand-ink">
                Deal Submitted
              </h3>
              <p className="mb-8 text-brand-ink/70">
                It went straight to underwriting. We'll confirm receipt and flag
                anything else we need — same day.
              </p>
              <button
                type="button"
                onClick={() => setStatus("idle")}
                className="font-semibold text-brand-blue transition-colors duration-200 ease-out hover:text-brand-ink"
              >
                Submit another deal
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Off-screen and out of the tab order. A person can never
                  fill this; most bots fill everything they find. */}
              <input
                aria-hidden="true"
                autoComplete="off"
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
                name="website"
                tabIndex={-1}
                type="text"
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-name" className={labelClass}>
                    Your Name
                  </label>
                  <input
                    id="f-name"
                    ref={nameRef}
                    name="name"
                    type="text"
                    required
                    autoComplete="name"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-role" className={labelClass}>
                    I Am The
                  </label>
                  <select
                    id="f-role"
                    name="role"
                    required
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select one...
                    </option>
                    <option>Property Owner</option>
                    <option>Broker / Agent</option>
                    <option>Wholesaler</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-email" className={labelClass}>
                    Email
                  </label>
                  <input
                    id="f-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-phone" className={labelClass}>
                    Phone
                  </label>
                  <input
                    id="f-phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-asset" className={labelClass}>
                    Property Type
                  </label>
                  <select
                    id="f-asset"
                    name="asset_type"
                    required
                    value={assetType}
                    onChange={(e) => onAssetTypeChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select type...
                    </option>
                    <option>Mobile Home Park</option>
                    <option>RV Park</option>
                    <option>Multifamily / Apartment</option>
                    <option>SFH Portfolio</option>
                    <option>Single-Family Home</option>
                    <option>Care Facility (ALF / Sober Living / Care)</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-price" className={labelClass}>
                    Asking Price
                  </label>
                  <input
                    id="f-price"
                    name="asking_price"
                    type="text"
                    inputMode="numeric"
                    placeholder="$"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="f-address" className={labelClass}>
                  Property Address
                </label>
                <input
                  id="f-address"
                  name="property_address"
                  type="text"
                  required
                  placeholder="Street, City, State"
                  className={inputClass}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-financing" className={labelClass}>
                    Current Financing
                  </label>
                  <select
                    id="f-financing"
                    name="current_financing"
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select status...
                    </option>
                    <option>Free &amp; clear</option>
                    <option>Existing mortgage</option>
                    <option>Not sure</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="f-open" className={labelClass}>
                    Seller Open To
                  </label>
                  <select
                    id="f-open"
                    name="seller_open_to"
                    defaultValue=""
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Select...
                    </option>
                    <option>Seller financing</option>
                    <option>Subject-to</option>
                    <option>Hybrid / creative structure</option>
                    <option>Cash / conventional only</option>
                    <option>Not sure yet</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="f-notes" className={labelClass}>
                  Deal Notes{" "}
                  <span className="font-normal text-brand-ink/45">
                    (Optional)
                  </span>
                </label>
                <textarea
                  id="f-notes"
                  name="notes"
                  rows={4}
                  placeholder="Units/sites, occupancy, income, why they're selling, any specific terms you're looking for..."
                  className={`${inputClass} min-h-[120px] resize-y`}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="f-docs" className={labelClass}>
                  Documents <span className="font-normal">(required)</span>
                </label>
                <input
                  accept="*/*"
                  className="w-full cursor-pointer rounded-xl border border-brand-ink/10 bg-brand-cream px-4 py-3 text-[0.88rem] text-brand-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-ink file:px-3 file:py-1.5 file:text-[0.82rem] file:font-semibold file:text-white hover:file:bg-brand-deep"
                  id="f-docs"
                  multiple
                  onChange={(event) => {
                    // Append rather than replace. Picking files one at a time
                    // is normal, and replacing silently dropped the earlier
                    // ones - the seller saw three, we received the last.
                    const picked = Array.from(event.target.files ?? []);
                    setFiles((current) => {
                      const seen = new Set(
                        current.map((f) => `${f.name}:${f.size}`),
                      );
                      return [
                        ...current,
                        ...picked.filter(
                          (f) => !seen.has(`${f.name}:${f.size}`),
                        ),
                      ];
                    });
                    // Clear the input so re-picking the same file still fires.
                    event.target.value = "";
                  }}
                  type="file"
                />
                <p className="text-[0.8rem] text-brand-ink/55">
                  Rent roll, T12, OM or photos. Images and PDFs, up to 15 MB
                  each. Note it above and we&apos;ll send a secure upload link.
                </p>
                {files.length > 0 && (
                  <ul className="mt-0.5 space-y-1">
                    {files.map((file) => (
                      <li
                        className="truncate text-[0.8rem] font-medium text-brand-blue"
                        key={file.name}
                      >
                        {file.name}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-3 text-[0.88rem] font-medium text-red-700">
                  {error}
                </p>
              )}

              <ArrowButton
                type="submit"
                variant="dark"
                fullWidth
                disabled={status === "submitting"}
              >
                {status === "submitting" ? "Submitting..." : "Submit Your Deal"}
              </ArrowButton>
              <p className="text-center text-[0.85rem] text-brand-ink/50">
                Goes straight to underwriting. We respond same day.
              </p>
            </form>
          )}
        </motion.div>
      </div>
    </section>
  );
}
