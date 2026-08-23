import React from "react";
import { apiFetch } from "../../lib/apiFetch";

export type DailyTaskPriority = "Urgent" | "Not urgent";
/** "draft" is the old name for "backlog", kept until the rows are migrated. */
export type DailyTaskState =
  | "draft"
  | "backlog"
  | "todo"
  | "in_progress"
  | "completed";

export type DailyTaskFile = {
  id: string;
  task_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

export type DailyTask = {
  id: string;
  owner_cockpit: string;
  title: string;
  description: string | null;
  priority: DailyTaskPriority;
  state: DailyTaskState;
  completion_note: string | null;
  created_at: string;
  created_on: string;
  completed_at: string | null;
  /** Date in the business timezone, so everyone agrees which day it was. */
  completed_on: string | null;
  /** Date the task is due, in the business timezone. Null means no deadline. */
  due_on: string | null;
  files: DailyTaskFile[];
};

const POLL_MS = 30_000;

type Options = {
  /** Only Raj may pass someone else's cockpit. */
  owner?: string;
};

export function useDailyTasks({ owner }: Options = {}) {
  const [tasks, setTasks] = React.useState<DailyTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [today, setToday] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const url = owner
        ? `/api/daily-tasks?owner=${encodeURIComponent(owner)}`
        : "/api/daily-tasks";

      const res = await apiFetch(url);
      if (res.status === 401) return; // signed out mid-poll

      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Could not load tasks");

      setTasks(Array.isArray(body.tasks) ? body.tasks : []);
      if (body.today) setToday(body.today);
      setError("");
    } catch (err) {
      console.error("Failed to load daily tasks:", err);
      setError(err instanceof Error ? err.message : "Could not load tasks");
    } finally {
      setLoading(false);
    }
  }, [owner]);

  React.useEffect(() => {
    load();
  }, [load]);

  // Poll while visible, and refresh the moment the tab regains focus.
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, POLL_MS);

    function handleVisibility() {
      if (!document.hidden) load();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load]);

  const createTask = React.useCallback(
    async (input: {
      title: string;
      description: string;
      priority: DailyTaskPriority;
      /**
       * YYYY-MM-DD. A date sends the task to To Do; without one it goes to
       * the backlog. The server decides - the caller does not pass a state.
       */
      due_on?: string;
      /** Checklist lines to create once the task exists. */
      items?: string[];
    }) => {
      const { items, ...fields } = input;

      const res = await apiFetch("/api/daily-tasks", {
        method: "POST",
        body: JSON.stringify(fields),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(body?.error || "Could not create the task");

      const task = body.task as DailyTask;

      // Items need the task id, so they can only be written after it exists.
      // A failure here leaves the task standing rather than losing the lot.
      for (const label of items ?? []) {
        try {
          await apiFetch("/api/daily-task-items", {
            method: "POST",
            body: JSON.stringify({ task_id: task.id, label }),
          });
        } catch (err) {
          console.error("Could not add a checklist item:", err);
        }
      }

      setTasks((current) => [task, ...current]);
      return task;
    },
    [],
  );

  const completeTask = React.useCallback(
    async (id: string, note: string) => {
      setBusyId(id);
      try {
        const res = await apiFetch("/api/daily-tasks", {
          method: "PATCH",
          body: JSON.stringify({ id, action: "complete", note }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body?.error || "Could not complete it");

        // Refetch rather than patch in place, so evidence uploaded during
        // the same flow comes back attached.
        await load();
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const reopenTask = React.useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await apiFetch("/api/daily-tasks", {
          method: "PATCH",
          body: JSON.stringify({ id, action: "reopen" }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body?.error || "Could not reopen it");

        await load();
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  /** Backlog -> To Do. The server refuses without a due date. */
  const publishTask = React.useCallback(
    async (id: string, dueOn?: string) => {
      setBusyId(id);
      try {
        const res = await apiFetch("/api/daily-tasks", {
          method: "PATCH",
          body: JSON.stringify({ id, action: "publish", due_on: dueOn }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body?.error || "Could not start it");

        await load();
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  /**
   * Soft delete. The row stays in the database so evidence and notifications
   * keep making sense - it just disappears from every list.
   */
  const deleteTask = React.useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await apiFetch("/api/daily-tasks", {
          method: "PATCH",
          body: JSON.stringify({ id, action: "delete" }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body?.error || "Could not delete it");

        setTasks((current) => current.filter((task) => task.id !== id));
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  /** To Do -> In Progress. Starting work is always deliberate. */
  const startTask = React.useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = await apiFetch("/api/daily-tasks", {
          method: "PATCH",
          body: JSON.stringify({ id, action: "start" }),
        });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(body?.error || "Could not start it");

        await load();
        return true;
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const backlog = React.useMemo(
    // "draft" rows are pre-migration backlog items.
    () => tasks.filter((t) => t.state === "backlog" || t.state === "draft"),
    [tasks],
  );

  const todo = React.useMemo(
    () => tasks.filter((task) => task.state === "todo"),
    [tasks],
  );

  const inProgress = React.useMemo(
    () => tasks.filter((task) => task.state === "in_progress"),
    [tasks],
  );

  const completed = React.useMemo(
    () => tasks.filter((task) => task.state === "completed"),
    [tasks],
  );

  return {
    backlog,
    busyId,
    completeTask,
    completed,
    createTask,
    deleteTask,
    /** @deprecated Use `backlog`. Kept so existing screens keep working. */
    drafts: backlog,
    error,
    inProgress,
    loading,
    publishTask,
    refresh: load,
    reopenTask,
    startTask,
    tasks,
    today,
    todo,
  };
}
