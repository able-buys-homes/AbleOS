// src/features/pipeline/useDraftDeals.ts
// Draft deals from the underwriting inbox, waiting on a human.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiFetch";
import type { DealStage } from "./types";

export type DraftDeal = {
  id: string;
  name: string;
  address: string | null;
  source: string | null;
  bird_dog: string | null;
  notes: string | null;
  stage: DealStage;
  purchase_price: string | number | null;
  monthly_cash_flow: string | number | null;
  dscr: string | number | null;
  origin: string;
  /** Structured answers from the website form. Null for email drafts. */
  submission: {
    role?: string | null;
    asset_type?: string | null;
    current_financing?: string | null;
    seller_open_to?: string | null;
  } | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  extracted: {
    is_deal?: boolean;
    confidence?: number;
    reasoning?: string;
  } | null;
  email_from: string | null;
  email_subject: string | null;
  email_received_at: string | null;
  email_excerpt: string | null;
  /** How many documents arrived with this deal. Counted server-side. */
  file_count: number;
  created_at: string;
};

export type ConfirmInput = {
  name: string;
  birdDog?: string;
  address?: string;
  source?: string;
  notes?: string;
  purchasePrice?: string;
  monthlyCashFlow?: string;
  dscr?: string;
  stage: DealStage;
  /** Mirrors the public website form, editable during review. */
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  role?: string;
  assetType?: string;
  currentFinancing?: string;
  sellerOpenTo?: string;
};

async function readError(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export function useDraftDeals() {
  const [drafts, setDrafts] = useState<DraftDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/pipeline-deals");

      if (!res.ok) {
        setError(await readError(res, "Could not load drafts"));
        setDrafts([]);
        return;
      }

      const body = await res.json();
      setDrafts(Array.isArray(body.drafts) ? body.drafts : []);
    } catch {
      setError("Could not reach the server");
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Put a draft on the board. Removes it from the queue on success. */
  const confirm = useCallback(async (id: string, input: ConfirmInput) => {
    const res = await apiFetch("/api/pipeline-deals", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "confirm", ...input }),
    });

    if (!res.ok) throw new Error(await readError(res, "Could not confirm"));

    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  /** Not a deal. Keeps the row so the same email can't come back. */
  const dismiss = useCallback(async (id: string) => {
    const res = await apiFetch("/api/pipeline-deals", {
      method: "PATCH",
      body: JSON.stringify({ id, action: "dismiss" }),
    });

    if (!res.ok) throw new Error(await readError(res, "Could not dismiss"));

    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { drafts, loading, error, load, confirm, dismiss };
}
