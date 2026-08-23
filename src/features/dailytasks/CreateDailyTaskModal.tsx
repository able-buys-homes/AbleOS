import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { LoaderIcon, XIcon } from "lucide-react";
import type { DailyTaskPriority } from "./useDailyTasks";

const PRIORITIES: DailyTaskPriority[] = ["Not urgent", "Urgent"];

type CreateDailyTaskModalProps = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description: string;
    priority: DailyTaskPriority;
    due_on?: string;
    items?: string[];
  }) => Promise<unknown>;
};

export function CreateDailyTaskModal({
  open,
  onClose,
  onCreate,
}: CreateDailyTaskModalProps) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priority, setPriority] =
    React.useState<DailyTaskPriority>("Not urgent");
  const [dueOn, setDueOn] = React.useState("");
  const [items, setItems] = React.useState<string[]>([]);
  const [itemDraft, setItemDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("Not urgent");
    setDueOn("");
    setItems([]);
    setItemDraft("");
    setError("");
  }, [open]);

  function addItem() {
    const label = itemDraft.trim();
    if (!label) return;
    setItems((current) => [...current, label]);
    setItemDraft("");
  }

  React.useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose, saving]);

  async function submit() {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError("Give the task a name.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onCreate({
        title: cleanTitle,
        description: description.trim(),
        priority,
        // No state is sent on purpose. The server puts a dated task in To Do
        // and an undated one in the backlog.
        ...(dueOn ? { due_on: dueOn } : {}),
        ...(items.length ? { items } : {}),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that.");
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    submit();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-[#1A1A2E]/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:items-center sm:px-4 sm:py-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={() => {
            if (!saving) onClose();
          }}
        >
          <motion.form
            animate={{ opacity: 1, y: 0 }}
            className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleSubmit}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="shrink-0 border-b border-[#DCE4EE] px-5 pb-4 pt-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                    Daily work
                  </p>
                  <h2 className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[#1A1A2E]">
                    New task
                  </h2>
                </div>
                <button
                  aria-label="Close"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#93A3B8] transition-colors hover:bg-[#F1F5F9]"
                  disabled={saving}
                  onClick={onClose}
                  type="button"
                >
                  <XIcon aria-hidden="true" size={16} />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <label className="block" htmlFor="daily-task-title">
                <span className="text-[16px] font-semibold tracking-[0.08em] text-[#8291A5]">
                  Task name
                </span>
                <input
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-[#DCE4EE] bg-[#F8FAFC] px-3 py-2.5 text-[18px] font-medium text-[#1A1A2E] outline-none transition-colors focus:border-[#1E3A8A] focus:bg-white"
                  disabled={saving}
                  id="daily-task-title"
                  maxLength={200}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="What are you working on?"
                  value={title}
                />
              </label>

              <label className="block" htmlFor="daily-task-description">
                <span className="text-[16px] font-semibold tracking-[0.08em] text-[#8291A5]">
                  Description
                </span>
                <textarea
                  className="mt-1.5 w-full resize-none rounded-xl border border-[#DCE4EE] bg-[#F8FAFC] px-3 py-2.5 text-[18px] font-medium leading-relaxed text-[#1A1A2E] outline-none transition-colors focus:border-[#1E3A8A] focus:bg-white"
                  disabled={saving}
                  id="daily-task-description"
                  maxLength={2000}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Optional. What does done look like?"
                  rows={4}
                  value={description}
                />
              </label>

              <div>
                <span className="text-[16px] font-semibold tracking-[0.08em] text-[#8291A5]">
                  Priority
                </span>
                <div className="mt-1.5 flex gap-2">
                  {PRIORITIES.map((option) => {
                    const active = priority === option;
                    return (
                      <button
                        className={`flex-1 rounded-xl border px-3 py-2.5 text-[16px] font-semibold tracking-wide transition-colors ${
                          active
                            ? option === "Urgent"
                              ? "border-[#DC2626] bg-[#FEE2E2] text-[#DC2626]"
                              : "border-[#1E3A8A] bg-[#EEF5FF] text-[#1E3A8A]"
                            : "border-[#DCE4EE] bg-white text-[#93A3B8] hover:border-[#B7C7DC]"
                        }`}
                        disabled={saving}
                        key={option}
                        onClick={() => setPriority(option)}
                        type="button"
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block" htmlFor="daily-task-due">
                <span className="text-[16px] font-semibold tracking-[0.08em] text-[#8291A5]">
                  Due date <span className="font-normal">(optional)</span>
                </span>
                <input
                  className="mt-1.5 w-full rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[16px] font-medium text-[#1A1A2E] outline-none transition-colors focus:border-[#418BFF]"
                  disabled={saving}
                  id="daily-task-due"
                  onChange={(event) => setDueOn(event.target.value)}
                  type="date"
                  value={dueOn}
                />
              </label>
              <div>
                <span className="text-[16px] font-semibold tracking-[0.08em] text-[#8291A5]">
                  Checklist <span className="font-normal">(optional)</span>
                </span>

                {items.length > 0 && (
                  <ul className="mt-1.5 space-y-1.5">
                    {items.map((label, index) => (
                      <li
                        className="flex items-start gap-2.5 rounded-xl bg-[#F8FAFC] px-3 py-2"
                        key={`${label}-${index}`}
                      >
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[#CBD5E1] bg-white" />
                        <span className="min-w-0 flex-1 text-[16px] leading-[1.5] text-[#1A1A2E]">
                          {label}
                        </span>
                        <button
                          aria-label={`Remove ${label}`}
                          className="shrink-0 px-1 text-[18px] leading-none text-[#A3B0C0] transition-colors hover:text-[#DC2626]"
                          disabled={saving}
                          onClick={() =>
                            setItems((current) =>
                              current.filter((_, i) => i !== index),
                            )
                          }
                          type="button"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-1.5 flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-xl border border-[#DCE4EE] bg-white px-3 py-2.5 text-[16px] font-medium text-[#1A1A2E] placeholder:text-[#A3B0C0] outline-none transition-colors focus:border-[#418BFF]"
                    disabled={saving}
                    onChange={(event) => setItemDraft(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter adds a line rather than submitting the form.
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addItem();
                      }
                    }}
                    placeholder="Add a step"
                    type="text"
                    value={itemDraft}
                  />
                  <button
                    className="shrink-0 rounded-xl border border-[#DCE4EE] px-3.5 py-2.5 text-[16px] font-semibold text-[#526176] transition-colors hover:bg-[#F1F5F9] disabled:opacity-40"
                    disabled={saving || !itemDraft.trim()}
                    onClick={addItem}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              </div>

              <p className="rounded-xl border border-dashed border-[#DCE4EE] bg-[#F8FAFC] px-3 py-2.5 text-[16px] font-medium leading-snug text-[#8291A5]">
                With a due date this goes straight to To Do and Raj is told.
                Without one it waits in the backlog until you give it a date.
              </p>

              {error ? (
                <p className="text-[16px] font-medium text-[#DC2626]">{error}</p>
              ) : null}
            </div>

            <div className="shrink-0 border-t border-[#DCE4EE] px-5 py-4">
              <div className="flex gap-2.5">
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1E3A8A] px-3 py-2.5 text-[16px] font-semibold tracking-wide text-white transition-colors hover:bg-[#172F6E] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? (
                    <LoaderIcon
                      className="animate-spin"
                      size={13}
                      strokeWidth={2.5}
                    />
                  ) : null}
                  {dueOn ? "Add to To Do" : "Add to Backlog"}
                </button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}