// Checklist items for one daily task. Loaded only when a task is open, so the
// list screen stays a single request.
import React from "react";
import { apiFetch } from "../../lib/apiFetch";

export type TaskItem = {
  id: string;
  task_id: string;
  label: string;
  done: boolean;
  done_at: string | null;
  sort_order: number;
};

export function useTaskItems(taskId: string | null) {
  const [items, setItems] = React.useState<TaskItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    if (!taskId) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/daily-task-items?task_id=${encodeURIComponent(taskId)}`,
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok)
        throw new Error(body?.error || "Could not load the checklist");

      setItems(Array.isArray(body.items) ? body.items : []);
      setError("");
    } catch (err) {
      setItems([]);
      setError(
        err instanceof Error ? err.message : "Could not load the checklist",
      );
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const addItem = React.useCallback(
    async (label: string) => {
      if (!taskId) return;

      const res = await apiFetch("/api/daily-task-items", {
        method: "POST",
        body: JSON.stringify({ task_id: taskId, label }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(body?.error || "Could not add that");

      setItems((current) => [...current, body.item]);
    },
    [taskId],
  );

  const toggleItem = React.useCallback(async (id: string, done: boolean) => {
    // Optimistic: ticking a box should feel instant.
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, done } : item)),
    );

    const res = await apiFetch("/api/daily-task-items", {
      method: "PATCH",
      body: JSON.stringify({ id, done }),
    });

    if (!res.ok) {
      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, done: !done } : item,
        ),
      );
    }
  }, []);

  const removeItem = React.useCallback(
    async (id: string) => {
      const previous = items;
      setItems((current) => current.filter((item) => item.id !== id));

      const res = await apiFetch(
        `/api/daily-task-items?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      if (!res.ok) setItems(previous);
    },
    [items],
  );

  const doneCount = items.filter((item) => item.done).length;

  return {
    addItem,
    doneCount,
    error,
    items,
    loading,
    refresh: load,
    removeItem,
    toggleItem,
    total: items.length,
  };
}
