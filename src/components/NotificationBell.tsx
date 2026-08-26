import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

// 5s so a filed inspection reaches Raj almost immediately. Only fires while the
// tab is visible, so a backgrounded phone costs nothing.
const POLL_MS = 5_000;

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function NotificationBell() {
  const [items, setItems] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const load = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/notifications");
      if (res.status === 401) return; // signed out mid-poll
      if (!res.ok) return;

      const data = await res.json();
      setItems(Array.isArray(data.notifications) ? data.notifications : []);
      setUnread(data.unreadCount ?? 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Poll while visible, and refresh the moment the app regains focus.
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

  React.useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  async function markAllRead() {
    // Optimistic: clear the badge immediately, then persist.
    setUnread(0);
    setItems((prev) =>
      prev.map((item) =>
        item.read_at ? item : { ...item, read_at: new Date().toISOString() },
      ),
    );

    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ markAllRead: true }),
      });
    } catch (err) {
      console.error("Failed to mark notifications read:", err);
      load(); // put the badge back if it didn't stick
    }
  }

  // Take the user to whatever the notification is about.
  function handleOpen(item: Notification) {
    setOpen(false);

    if (!item.link) return;

    // Only ever navigate inside the app. A stored absolute URL would turn
    // this into an open redirect.
    if (!item.link.startsWith("/")) return;

    navigate(item.link);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAllRead();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={
          unread > 0 ? `${unread} unread notifications` : "View notifications"
        }
        className="relative grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#3B82C4]"
        onClick={toggle}
        type="button"
      >
        <BellIcon aria-hidden="true" size={17} strokeWidth={2.25} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 border-[#4BA3D6] bg-[#FF7832] px-1 text-[14px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute right-0 top-11 z-50 w-[300px] overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_16px_32px_rgba(30,58,138,0.18)]"
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            role="menu"
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            <div className="flex items-center justify-between border-b border-[#E6ECF2] px-4 py-3">
              <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                Notifications
              </p>
              {items.length > 0 && (
                <CheckCheckIcon
                  aria-hidden="true"
                  className="text-[#93A3B8]"
                  size={14}
                  strokeWidth={2.5}
                />
              )}
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {loading && (
                <p className="px-4 py-5 text-[16px] font-medium text-[#8A99AC]">
                  Loading...
                </p>
              )}

              {!loading && items.length === 0 && (
                <p className="px-4 py-5 text-[16px] font-medium leading-snug text-[#8A99AC]">
                  Nothing new. You&apos;re all caught up.
                </p>
              )}

              {items.map((item) => (
                <button
                  className="block w-full border-b border-[#F1F5F9] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[#F8FAFC]"
                  key={item.id}
                  onClick={() => handleOpen(item)}
                  type="button"
                >
                  <div className="flex items-start gap-2.5">
                    {!item.read_at && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#FF7832]"
                      />
                    )}
                    <div
                      className={item.read_at ? "min-w-0 pl-[18px]" : "min-w-0"}
                    >
                      <p className="text-[16px] font-semibold leading-snug tracking-[-0.01em] text-[#1A1A2E]">
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="mt-0.5 text-[16px] font-medium leading-snug text-[#6B7A90]">
                          {item.body}
                        </p>
                      )}
                      <p className="mt-1 text-[16px] font-medium tracking-wide text-[#A3B0C0]">
                        {timeAgo(item.created_at)}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
