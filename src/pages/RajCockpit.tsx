import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LoaderIcon, PlusIcon, XIcon } from "lucide-react";
import { UserMenu } from "../components/UserMenu";
import { Link } from "react-router-dom";
import { apiFetch } from "../lib/apiFetch";
import { NotificationBell } from "../components/NotificationBell";
import { ApprovalQueue, type Stage } from "../features/approvals/ApprovalQueue";
import { GateQueueModal } from "../features/approvals/GateQueueModal";
import { OrderRow } from "../features/orders/OrderRow";
import { FilterMenu } from "../components/FilterMenu";
import { AskAble } from "../features/assistant/AskAble";
import { DailyProgressModal } from "../features/dailytasks/DailyProgressModal";
import { useDailyTasks } from "../features/dailytasks/useDailyTasks";
import { ApprovedGatesModal } from "../features/approvals/ApprovedGatesModal";
import { DriveLinksModal } from "../components/DriveLinksModal";
import { QuickTiles } from "../components/QuickTiles";
import { NavCard } from "../components/NavCard";
import { UnitInspectionsCard } from "../features/inspections/UnitInspectionsCard";
import {
  CameraIcon,
  FileTextIcon,
  GlobeIcon,
  ShieldCheckIcon,
  TrendingUpIcon,
} from "lucide-react";
import { AssignTaskModal } from "../components/AssignTaskModal";
import { AssignedTasksModal } from "../features/tasks/AssignedTasksModal";
import { useNotificationTarget } from "../lib/useNotificationTarget";
import type { Task } from "../features/tasks/TaskCard";
import { TaskChatModal } from "../features/tasks/TaskChatModal";

type Order = {
  id: string;
  order_name: string;
  description: string;
  date_needed: string;
  priority: "Low" | "Normal" | "Urgent";
  estimated_cost: string | number | null;
  requested_by: string;
  status: "Pending" | "Approved" | "Declined";
  created_at: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Github Password(Able): Able@2026$ */

/** Returns null for empty or zero cost, so "no cost" renders as nothing. */
function formatCost(value: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount === 0) return null;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

const priorityStyles: Record<Order["priority"], string> = {
  Low: "bg-[#EEF2F6] text-[#526176]",
  Normal: "bg-[#EEF5FF] text-[#418BFF]",
  Urgent: "bg-[#FFF1E9] text-[#D95717]",
};

const reveal = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function RajCockpit() {
  const [selectedOrder, setSelectedOrder] = React.useState<Order | null>(null);
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [gateCount, setGateCount] = React.useState<number | null>(null);
  const [gatesOpen, setGatesOpen] = React.useState(false);
  const [ordersOpen, setOrdersOpen] = React.useState(false);

  /* Dane's own daily work. Read-only from here. */
  const daneDaily = useDailyTasks({ owner: "dane" });
  const [progressOpen, setProgressOpen] = React.useState(false);
  const [progressInitialView, setProgressInitialView] = React.useState<
    "in_progress" | "completed" | "assigned" | undefined
  >(undefined);
  const [progressInitialMode, setProgressInitialMode] = React.useState<
    "today" | "this_week" | "last_week" | "all" | "date" | undefined
  >(undefined);
  const [driveOpen, setDriveOpen] = React.useState(false);
  const [approvingTask, setApprovingTask] = React.useState<string | null>(null);
  const [focusTaskId, setFocusTaskId] = React.useState<string | null>(null);

  /* Raj signing off on work he assigned. Only then does it count as done. */
  async function approveTask(id: string) {
    setApprovingTask(id);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id, action: "approve" }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(body?.error || "Could not approve it");

      setTasks((current) =>
        current.map((task) => (task.id === id ? body.task : task)),
      );
    } catch (err) {
      console.error("Failed to approve task:", err);
    } finally {
      setApprovingTask(null);
    }
  }
  const [stages, setStages] = React.useState<Stage[]>([]);
  const [stagesLoaded, setStagesLoaded] = React.useState(false);
  const [approvedOpen, setApprovedOpen] = React.useState(false);

  const handleStagesLoaded = React.useCallback((loaded: Stage[]) => {
    setStages(loaded);
    setStagesLoaded(true);
  }, []);

  const approvedCount = stagesLoaded
    ? stages.filter((stage) => stage.rajApproved).length
    : null;
  const [taskToast, setTaskToast] = React.useState("");

  React.useEffect(() => {
    if (!taskToast) return;
    const timer = setTimeout(() => setTaskToast(""), 4000);
    return () => clearTimeout(timer);
  }, [taskToast]);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [ordersError, setOrdersError] = React.useState("");
  const [orderFilter, setOrderFilter] = React.useState<
    "All" | "Pending" | "Approved" | "Declined"
  >("Pending");

  /* Counts and KPIs mean "waiting on me", not "every order ever sent". */
  const pendingOrders = orders.filter((order) => order.status === "Pending");

  const visibleOrders =
    orderFilter === "All"
      ? orders
      : orders.filter((order) => order.status === orderFilter);
  const loadOrders = React.useCallback(async () => {
    setOrdersError("");
    try {
      const res = await apiFetch("/api/orders");
      // Signed out mid-poll - not an error, just stop.
      if (res.status === 401) {
        setOrders([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load orders (${res.status})`);
      const data = await res.json();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      setOrdersError(
        err instanceof Error ? err.message : "Could not load approval requests",
      );
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [tasksLoaded, setTasksLoaded] = React.useState(false);
  const [tasksOpen, setTasksOpen] = React.useState(false);
  const [savingTask, setSavingTask] = React.useState<string | null>(null);
  const [chatTask, setChatTask] = React.useState<Task | null>(null);

  /* Notifications deep-link into here, e.g. /raj?task=<id>&chat=1 */
  const { clear, target } = useNotificationTarget();

  React.useEffect(() => {
    if (target.order) {
      // Wait for the list before deciding the id is missing.
      if (ordersLoading) return;
      const found = orders.find((order) => order.id === target.order);
      if (found) setSelectedOrder(found);
      clear();
      return;
    }

    if (target.task) {
      if (!tasksLoaded) return;
      const found = tasks.find((task) => task.id === target.task);
      if (found && target.chat) {
        setChatTask(found);
      } else {
        // Open the list and expand the task the notification was about.
        setFocusTaskId(target.task);
        setTasksOpen(true);
      }
      clear();
      return;
    }

    if (target.daneTask) {
      setProgressInitialView(undefined);
      setProgressInitialMode(undefined);
      setProgressOpen(true);
      clear();
      return;
    }

    // Raj's gate queue is already on the page, so there is nothing to open.
    if (target.stage) clear();
  }, [clear, orders, ordersLoading, target, tasks, tasksLoaded]);
  const [commentCounts, setCommentCounts] = React.useState<
    Record<string, number>
  >({});

  const loadCommentCounts = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/task-comments?counts=1");
      if (!res.ok) return;
      const data = await res.json();
      setCommentCounts(data.counts ?? {});
    } catch (err) {
      console.error("Failed to load comment counts:", err);
    }
  }, []);

  const loadTaskCount = React.useCallback(async () => {
    try {
      const res = await apiFetch("/api/tasks");
      if (!res.ok) return;
      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    } finally {
      setTasksLoaded(true);
    }
  }, []);

  const openTaskCount = tasksLoaded
    ? tasks.filter((task) => task.status !== "Done").length
    : null;

  async function deleteTask(id: string) {
    try {
      const res = await apiFetch("/api/tasks", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await res.text());

      // Drop it locally straight away so the list doesn't flicker.
      setTasks((prev) => prev.filter((task) => task.id !== id));
      setTaskToast("Task deleted");
    } catch (err) {
      console.error("Failed to delete task:", err);
      setTaskToast("Could not delete that task");
      loadTaskCount();
    }
  }

  async function updateTaskStatus(id: string, status: Task["status"]) {
    setSavingTask(id);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadTaskCount();
    } catch (err) {
      console.error("Failed to update task:", err);
    } finally {
      setSavingTask(null);
    }
  }

  React.useEffect(() => {
    loadOrders();
    loadTaskCount();
    loadCommentCounts();
  }, [loadOrders, loadTaskCount, loadCommentCounts]);

  // Poll every 30s, but only while the tab is visible. Also refresh on focus
  // so switching back to this tab shows current data immediately.
  React.useEffect(() => {
    const REFRESH_MS = 30_000;

    const timer = setInterval(() => {
      if (!document.hidden) loadOrders();
    }, REFRESH_MS);

    function handleVisibility() {
      if (!document.hidden) loadOrders();
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadOrders, loadTaskCount]);

  return (
    <>
      <div className="min-h-screen w-full bg-[#EEF2F6] text-[#1A1A2E]">
        <header className="bg-gradient-to-r from-[#5EC5E8] to-[#3B82C4] text-white shadow-sm">
          <div className="mx-auto max-w-[428px] px-5 pb-8 pt-5 sm:max-w-2xl sm:px-8 sm:pb-10 sm:pt-6 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
            <div className="flex items-center justify-between">
              <img
                src="/able-logo.png"
                alt="Able Buys Homes"
                className="h-12 w-12 rounded-xl bg-[#191919] p-0.5 object-contain shadow-sm"
              />
              <div className="flex items-center gap-3">
                <nav
                  aria-label="Workspace pages"
                  className="flex items-center gap-1 rounded-full bg-white/15 p-1"
                >
                  <span
                    aria-current="page"
                    className="rounded-full bg-white px-3 py-2 text-[16px] font-medium text-[#1E3A8A]"
                  >
                    Cockpit
                  </span>
                  <Link
                    className="rounded-full px-3 py-2 text-[16px] font-medium text-white/80 transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-white"
                    to="/raj/pipeline"
                  >
                    Pipeline
                  </Link>
                </nav>
                <NotificationBell />
                <UserMenu />
              </div>
            </div>

            <p className="mt-6 text-[16px] font-medium tracking-[0.01em] text-white/85">
              ABLE OS · Executive workspace
            </p>
            <h1 className="mt-1 text-[32px] font-extrabold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
              Raj&apos;s Cockpit
            </h1>
            <p className="mt-2 max-w-md text-[18px] font-normal leading-[1.5] text-white/90">
              A clear view of today&apos;s decisions and operating load.
            </p>
          </div>
        </header>

        <main className="mx-auto max-w-[428px] px-5 pb-10 sm:max-w-2xl sm:px-8 sm:pb-14 lg:max-w-5xl lg:px-10 xl:max-w-6xl">
          <motion.section
            animate="visible"
            aria-labelledby="profile-heading"
            className="relative -mt-4 overflow-hidden rounded-2xl border border-[#DCE4EE] bg-white shadow-[0_8px_20px_rgba(30,58,138,0.08)]"
            initial="hidden"
            transition={{ duration: 0.35, ease: "easeOut" }}
            variants={reveal}
          >
            <div className="absolute inset-y-0 left-0 w-1.5 bg-[#1E3A8A]" />
            <div className="flex items-center justify-between gap-4 px-5 py-4 pl-6 sm:px-7 sm:py-5 sm:pl-8">
              <div>
                <p className="text-[16px] font-medium text-[#5B6B82]">
                  Personal dashboard
                </p>
                <h2
                  className="mt-1 text-[22px] font-semibold tracking-[-0.02em]"
                  id="profile-heading"
                >
                  Raj · CEO
                </h2>
                <p className="mt-1 text-[16px] font-normal leading-[1.5] text-[#64748B]">
                  Vision · Acquisitions · Capital · Partnerships
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-stretch gap-2">
                <button
                  className="flex items-center justify-center gap-2 rounded-xl bg-[#418BFF] px-5 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[#2F6FD8] focus:outline-none focus:ring-2 focus:ring-[#418BFF] focus:ring-offset-2"
                  onClick={() => setAssignOpen(true)}
                  type="button"
                >
                  <PlusIcon aria-hidden="true" size={15} strokeWidth={3} />
                  Assign Task
                </button>

                {/* Raj's own site. Sellers reach it by link or QR code. */}
                <a
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#DCE4EE] bg-white px-4 py-2.5 text-[15px] font-semibold text-[#418BFF] shadow-sm transition-colors hover:bg-[#F5F8FC]"
                  href="https://ablebuyshomes.com/?from=cockpit"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <GlobeIcon className="h-4 w-4" /> View My Website
                </a>
              </div>
            </div>
          </motion.section>
          <motion.section
            animate="visible"
            aria-labelledby="queue-heading"
            className="pt-8"
            initial="hidden"
            transition={{ delay: 0.08, duration: 0.35, ease: "easeOut" }}
            variants={reveal}
          >
            <QuickTiles onOpenDrive={() => setDriveOpen(true)} />

            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              <StatCard
                label="Gates awaiting you"
                onClick={() => setGatesOpen(true)}
                tone={gateCount ? "urgent" : "primary"}
                value={gateCount !== null ? String(gateCount) : "..."}
              />
              <StatCard
                label="Approval requests"
                onClick={() => {
                  setOrderFilter("Pending");
                  setOrdersOpen(true);
                }}
                tone={orders.length ? "urgent" : "primary"}
                value={ordersLoading ? "..." : String(pendingOrders.length)}
              />
              <StatCard
                label="Dane's progress"
                onClick={() => {
                  setProgressInitialView("completed");
                  setProgressInitialMode("all");
                  setProgressOpen(true);
                }}
                tone="primary"
                value={
                  daneDaily.loading || !tasksLoaded
                    ? "..."
                    : String(
                        daneDaily.completed.length +
                          tasks.filter(
                            (task) =>
                              task.assigned_to === "dane" && task.approved_at,
                          ).length,
                      )
                }
              />
              <StatCard
                label="Gates approved"
                onClick={() => setApprovedOpen(true)}
                tone="success"
                value={approvedCount !== null ? String(approvedCount) : "..."}
              />
            </div>
          </motion.section>
          <motion.div
            animate="visible"
            initial="hidden"
            transition={{ delay: 0.16, duration: 0.38, ease: "easeOut" }}
            variants={reveal}
          >
            <div>
              <div>
                {/* Gates on the left */}
                <section aria-labelledby="gates-heading" className="pt-8">
                  <h2 className="sr-only" id="gates-heading">
                    Gates awaiting you
                  </h2>
                  <NavCard
                    count={gateCount}
                    icon={<CameraIcon size={20} strokeWidth={2.25} />}
                    onClick={() => setGatesOpen(true)}
                    subtitle="Photos submitted for your sign-off"
                    title="Gates awaiting you"
                    tone="orange"
                  />
                </section>

                <GateQueueModal
                  count={gateCount}
                  eyebrow="Photo approvals"
                  onClose={() => setGatesOpen(false)}
                  open={gatesOpen}
                  title="Gates awaiting you"
                >
                  <ApprovalQueue
                    onCountChange={setGateCount}
                    onStagesLoaded={handleStagesLoaded}
                    role="raj"
                  />
                </GateQueueModal>

                <section aria-labelledby="approved-heading" className="pt-3">
                  <h2 className="sr-only" id="approved-heading">
                    Gates approved
                  </h2>
                  <NavCard
                    count={approvedCount}
                    icon={<ShieldCheckIcon size={20} strokeWidth={2.25} />}
                    onClick={() => setApprovedOpen(true)}
                    subtitle="Every stage you have signed off"
                    title="Gates approved"
                    tone="green"
                  />
                </section>

                <section aria-labelledby="approval-heading" className="pt-3">
                  <h2 className="sr-only" id="approval-heading">
                    Approval requests
                  </h2>
                  <NavCard
                    count={ordersLoading ? null : pendingOrders.length}
                    icon={<FileTextIcon size={20} strokeWidth={2.25} />}
                    onClick={() => setOrdersOpen(true)}
                    subtitle="Orders submitted for your decision"
                    title="Approval requests"
                    tone="orange"
                  />
                </section>

                <GateQueueModal
                  count={ordersLoading ? null : pendingOrders.length}
                  eyebrow="From the team"
                  toolbar={
                    <FilterMenu
                      onChange={setOrderFilter}
                      options={[
                        {
                          key: "Pending",
                          label: "Pending",
                          count: pendingOrders.length,
                        },
                        {
                          key: "Approved",
                          label: "Approved",
                          count: orders.filter((o) => o.status === "Approved")
                            .length,
                        },
                        {
                          key: "Declined",
                          label: "Declined",
                          count: orders.filter((o) => o.status === "Declined")
                            .length,
                        },
                        { key: "All", label: "All", count: orders.length },
                      ]}
                      value={orderFilter}
                    />
                  }
                  onClose={() => setOrdersOpen(false)}
                  open={ordersOpen}
                  title="Approval requests"
                >
                  <div className="space-y-3">
                    {ordersLoading && (
                      <p className="text-[16px] font-normal text-[#8A99AC]">
                        Loading requests…
                      </p>
                    )}

                    {!ordersLoading && ordersError && (
                      <div className="rounded-2xl border border-dashed border-[#FFC9AE] bg-[#FFF6F1] px-5 py-4">
                        <p className="text-[16px] font-medium leading-[1.5] text-[#D95717]">
                          {ordersError}
                        </p>
                        <button
                          className="mt-2 text-[16px] font-medium text-[#418BFF] hover:underline"
                          onClick={loadOrders}
                          type="button"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {!ordersLoading && !ordersError && orders.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-[#F8FAFC] px-5 py-4">
                        <p className="text-[16px] font-normal leading-[1.5] text-[#8A99AC]">
                          Nothing awaiting your approval
                        </p>
                      </div>
                    )}

                    {visibleOrders.map((order) => (
                      <OrderRow
                        key={order.id}
                        onOpen={() => setSelectedOrder(order)}
                        order={order}
                        showRequester
                      />
                    ))}
                  </div>
                </GateQueueModal>
              </div>
            </div>
          </motion.div>

          <section aria-labelledby="progress-heading" className="pt-3">
            <h2 className="sr-only" id="progress-heading">
              Dane&apos;s Progress
            </h2>
            <NavCard
              count={daneDaily.loading ? null : daneDaily.inProgress.length}
              icon={<TrendingUpIcon size={20} strokeWidth={2.25} />}
              onClick={() => {
                setProgressInitialView(undefined);
                setProgressInitialMode(undefined);
                setProgressOpen(true);
              }}
              subtitle="What Dane is working on, and what he finished"
              title="Dane's Progress"
              tone="blue"
            />
          </section>

          <section aria-labelledby="inspections-heading" className="pt-3">
            <h2 className="sr-only" id="inspections-heading">
              Unit inspections
            </h2>
            <UnitInspectionsCard />
          </section>

          <DriveLinksModal
            onClose={() => setDriveOpen(false)}
            open={driveOpen}
          />

          <DailyProgressModal
            approvedTasks={tasks.filter(
              (task) => task.assigned_to === "dane" && task.approved_at,
            )}
            commentCounts={commentCounts}
            initialMode={progressInitialMode}
            initialView={progressInitialView}
            loading={daneDaily.loading}
            onClose={() => setProgressOpen(false)}
            onOpenAssigned={(task) => {
              // Hand off to the sheet that owns approve, chat and delete,
              // opened on the task that was tapped.
              setFocusTaskId(task.id);
              setTasksOpen(true);
            }}
            open={progressOpen}
            openAssigned={tasks.filter(
              (task) => task.assigned_to === "dane" && !task.approved_at,
            )}
            personLabel="Dane's Progress"
            tasks={daneDaily.tasks}
            today={daneDaily.today}
            waitingLabel="Waiting on you"
          />
          <footer className="pt-10 text-center text-[16px] font-normal text-[#8291A5]">
            Able OS · V1 Build
          </footer>
        </main>
      </div>

      <ApprovalModal
        onClose={() => setSelectedOrder(null)}
        onDecided={loadOrders}
        order={selectedOrder}
      />

      <ApprovedGatesModal
        loading={!stagesLoaded}
        onClose={() => setApprovedOpen(false)}
        open={approvedOpen}
        role="raj"
        stages={stages}
      />

      <TaskChatModal
        onChanged={loadCommentCounts}
        onClose={() => setChatTask(null)}
        task={chatTask}
      />

      <AskAble
        context={{
          approvalRequests: ordersLoading ? null : pendingOrders.length,
          daneInProgress: daneDaily.loading
            ? null
            : daneDaily.inProgress.length,
          gatesAwaiting: gateCount,
          openTasks: openTaskCount,
        }}
      />

      <AssignedTasksModal
        approvingId={approvingTask}
        focusTaskId={focusTaskId}
        onApprove={approveTask}
        commentCounts={commentCounts}
        loading={!tasksLoaded}
        onClose={() => setTasksOpen(false)}
        onDelete={deleteTask}
        onOpenChat={setChatTask}
        onStatusChange={updateTaskStatus}
        open={tasksOpen}
        savingTask={savingTask}
        tasks={tasks}
      />

      <AssignTaskModal
        onClose={() => setAssignOpen(false)}
        onCreated={() => {
          setTaskToast("Task assigned");
          loadTaskCount();
        }}
        open={assignOpen}
      />

      <AnimatePresence>
        {taskToast && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-2xl bg-[#1A1A2E] px-5 py-3.5 shadow-[0_16px_32px_rgba(26,26,46,0.28)]"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            role="status"
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <p className="text-[16px] font-medium text-white">{taskToast}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Subcomponents ──────────────────────────────────────── */

type StatCardProps = {
  value: string;
  label: string;
  tone: "primary" | "urgent";
  href?: string;
  onClick?: () => void;
};

function StatCard({
  value,
  label,
  tone,
  href,
  onClick,
}: Omit<StatCardProps, "tone"> & {
  tone: "primary" | "urgent" | "success";
}) {
  const tones = {
    primary: "text-[#418BFF] bg-[#EEF5FF]",
    urgent: "text-[#FF7832] bg-[#FFF1E9]",
    success: "text-[#16A34A] bg-[#EAF8EF]",
  };

  const content = (
    <>
      <p
        className={`inline-flex rounded-lg px-2.5 py-1.5 text-[28px] font-semibold leading-none tracking-[-0.03em] ${tones[tone]}`}
      >
        {value}
      </p>
      <p className="mt-2.5 text-[16px] font-normal leading-[1.4] text-[#718096]">
        {label}
      </p>
    </>
  );

  const baseClasses =
    "min-w-0 rounded-2xl border border-[#DCE4EE] bg-white px-3.5 py-4 shadow-[0_4px_12px_rgba(30,58,138,0.045)] sm:px-4 sm:py-5";

  if (onClick) {
    return (
      <button
        className={`${baseClasses} block w-full cursor-pointer text-left transition-shadow hover:shadow-[0_6px_16px_rgba(30,58,138,0.09)]`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} block cursor-pointer transition-shadow hover:shadow-[0_6px_16px_rgba(30,58,138,0.09)]`}
      >
        {content}
      </a>
    );
  }

  return <article className={baseClasses}>{content}</article>;
}

type ApprovalModalProps = {
  order: Order | null;
  onClose: () => void;
  /** Called after a decision succeeds, so the parent can refresh. */
  onDecided: () => void;
};

function ApprovalModal({ order, onClose, onDecided }: ApprovalModalProps) {
  const [busy, setBusy] = React.useState<"Approved" | "Declined" | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (order) {
      setBusy(null);
      setError("");
    }
  }, [order]);

  async function decide(status: "Approved" | "Declined") {
    if (!order) return;

    setBusy(status);
    setError("");

    try {
      const res = await apiFetch("/api/orders", {
        method: "PATCH",
        body: JSON.stringify({ id: order.id, status }),
      });

      const raw = await res.text();
      if (!res.ok) {
        let msg = `Failed to save decision (${res.status})`;
        try {
          const parsed = JSON.parse(raw);
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* keep default message */
        }
        throw new Error(msg);
      }

      onDecided();
      onClose();
    } catch (err) {
      console.error("Decision failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(null);
    }
  }

  const cost = order ? formatCost(order.estimated_cost) : null;

  return (
    <AnimatePresence>
      {order && (
        <motion.div
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A2E]/50 px-5 py-6"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="flex max-h-[85vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_rgba(30,58,138,0.18)]"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            onClick={(event) => event.stopPropagation()}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {/* Header — pinned */}
            <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6">
              <p className="text-[16px] font-medium text-[#5B6B82]">
                Approval request
              </p>
              <button
                aria-label="Close"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#93A3B8] transition-colors hover:bg-[#F1F5F9]"
                onClick={onClose}
                type="button"
              >
                <XIcon aria-hidden="true" size={16} />
              </button>
            </div>

            {/* Body — scrolls when the description is long */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
              <div className="mt-2 flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-[16px] font-extrabold leading-snug tracking-[-0.02em] text-[#1A1A2E]">
                  {order.order_name}
                </h3>
                <span
                  className={`mt-0.5 shrink-0 rounded-full px-2.5 py-1 text-[14px] font-medium ${priorityStyles[order.priority]}`}
                >
                  {order.priority}
                </span>
              </div>

              <p className="mt-3 whitespace-pre-line text-[16px] font-normal leading-[1.6] text-[#526176]">
                {order.description}
              </p>

              <dl className="mt-4 space-y-2 rounded-xl bg-[#F8FAFC] px-4 py-3">
                <Row label="Requested by" value={order.requested_by} />
                <Row
                  label="Date needed"
                  value={formatDate(order.date_needed)}
                />
                <Row label="Submitted" value={formatDate(order.created_at)} />
                {cost && <Row label="Estimated cost" value={cost} />}
              </dl>
            </div>

            {/* Footer — pinned, so Approve/Decline are always reachable */}
            <div className="shrink-0 border-t border-[#E6ECF2] px-6 pb-6 pt-4">
              {error && (
                <p className="mb-3 text-[16px] font-medium text-red-500">
                  {error}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#DCE4EE] px-5 py-3 text-[16px] font-medium text-[#526176] transition-colors hover:bg-[#F1F5F9] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy !== null}
                  onClick={() => decide("Declined")}
                  type="button"
                >
                  {busy === "Declined" ? (
                    <LoaderIcon
                      className="animate-spin"
                      size={14}
                      strokeWidth={2.5}
                    />
                  ) : null}
                  Decline
                </button>
                <button
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-5 py-3 text-[16px] font-medium text-white transition-colors hover:bg-[#15803D] disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:text-[#8A99AC]"
                  disabled={busy !== null}
                  onClick={() => decide("Approved")}
                  type="button"
                >
                  {busy === "Approved" ? (
                    <LoaderIcon
                      className="animate-spin"
                      size={14}
                      strokeWidth={2.5}
                    />
                  ) : null}
                  Approve
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[16px] font-normal text-[#8A99AC]">{label}</dt>
      <dd className="text-[16px] font-medium text-[#1A1A2E]">{value}</dd>
    </div>
  );
}
