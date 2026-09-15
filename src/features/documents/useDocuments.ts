// src/features/documents/useDocuments.ts
// Documents and critical dates - the two things Ellery's day is made of.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../lib/apiFetch";

export const DOC_STAGES = [
  "requested",
  "draft",
  "internal_review",
  "out_for_signature",
  "executed",
  "filed",
  "cancelled",
] as const;

export type DocStage = (typeof DOC_STAGES)[number];

export const DOC_STAGE_LABELS: Record<DocStage, string> = {
  requested: "Requested",
  draft: "Draft",
  internal_review: "Internal review",
  out_for_signature: "Out for signature",
  executed: "Executed",
  filed: "Filed",
  cancelled: "Cancelled",
};

export type AbleDocument = {
  id: string;
  deal_id: string | null;
  deal_name: string;
  doc_type: string;
  stage: DocStage;
  stage_changed_at: string;
  due_on: string | null;
  counterparty: string | null;
  file_url: string | null;
  notes: string | null;
  requested_by: string | null;
  created_by: string;
  created_at: string;
};

export type CriticalDate = {
  id: string;
  deal_id: string | null;
  deal_name: string;
  label: string;
  due_on: string;
  portfolio: "ahtx" | "htm";
  kind: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

async function readError(res: Response, fallback: string) {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export function useDocuments() {
  const [documents, setDocuments] = useState<AbleDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/documents");

      if (!res.ok) {
        setError(await readError(res, "Could not load documents"));
        setDocuments([]);
        return;
      }

      const body = await res.json();
      setDocuments(Array.isArray(body.documents) ? body.documents : []);
    } catch {
      setError("Could not reach the server");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const moveStage = useCallback(
    async (id: string, stage: DocStage) => {
      const before = documents;

      setDocuments((prev) =>
        prev.map((d) =>
          d.id === id
            ? { ...d, stage, stage_changed_at: new Date().toISOString() }
            : d,
        ),
      );

      try {
        const res = await apiFetch("/api/documents", {
          method: "PATCH",
          body: JSON.stringify({ id, stage }),
        });

        if (!res.ok) throw new Error(await readError(res, "Could not move it"));

        const { document } = await res.json();
        setDocuments((prev) => prev.map((d) => (d.id === id ? document : d)));
      } catch (err) {
        setDocuments(before);
        throw err;
      }
    },
    [documents],
  );

  const requestDocument = useCallback(
    async (input: {
      dealId: string;
      dealName: string;
      docType: string;
      dueOn?: string;
      counterparty?: string;
      notes?: string;
    }) => {
      const res = await apiFetch("/api/documents", {
        method: "POST",
        body: JSON.stringify(input),
      });

      if (!res.ok) throw new Error(await readError(res, "Could not save it"));

      const { document } = await res.json();
      setDocuments((prev) => [document, ...prev]);
      return document as AbleDocument;
    },
    [],
  );

  return { documents, loading, error, load, moveStage, requestDocument };
}

export function useCriticalDates() {
  const [dates, setDates] = useState<CriticalDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/critical-dates");

      if (!res.ok) {
        setError(await readError(res, "Could not load dates"));
        setDates([]);
        return;
      }

      const body = await res.json();
      setDates(Array.isArray(body.dates) ? body.dates : []);
    } catch {
      setError("Could not reach the server");
      setDates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Marking one done removes it from the list - it's no longer a worry. */
  const markDone = useCallback(async (id: string) => {
    const res = await apiFetch("/api/critical-dates", {
      method: "PATCH",
      body: JSON.stringify({ id, done: true }),
    });

    if (!res.ok) throw new Error(await readError(res, "Could not update it"));

    setDates((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const addDate = useCallback(
    async (input: {
      dealName: string;
      label: string;
      dueOn: string;
      kind?: string;
    }) => {
      const res = await apiFetch("/api/critical-dates", {
        method: "POST",
        body: JSON.stringify(input),
      });

      if (!res.ok) throw new Error(await readError(res, "Could not save it"));

      const { date } = await res.json();
      setDates((prev) =>
        [...prev, date].sort((a, b) => a.due_on.localeCompare(b.due_on)),
      );
      return date as CriticalDate;
    },
    [],
  );

  return { dates, loading, error, load, markDone, addDate };
}

/** Days until a date. Negative means it's already passed. */
export function daysUntil(due: string) {
  const target = new Date(`${due}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}