import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardListIcon,
  FileTextIcon,
  ListChecksIcon,
  PlusIcon,
  CheckIcon,
} from "lucide-react";
import { NavCard } from "../components/NavCard";
import { SubscriptionsCard } from "../features/subscriptions/SubscriptionsCard";
import { UserMenu } from "../components/UserMenu";
import { AddOrderModal } from "../components/AddOrderModal";
import { apiFetch } from "../lib/apiFetch";
import type { Task } from "../features/tasks/TaskCard";
import { TaskChatModal } from "../features/tasks/TaskChatModal";
import { GateQueueModal } from "../features/approvals/GateQueueModal";
import { TaskRow } from "../features/tasks/TaskRow";
import { FilterMenu } from "../components/FilterMenu";
import { OrderRow } from "../features/orders/OrderRow";
import { OrderDetailModal } from "../features/orders/OrderDetailModal";
import { TaskDetailModal } from "../features/tasks/TaskDetailModal";
import { CompleteDailyTaskModal } from "../features/dailytasks/CompleteDailyTaskModal";
import { CreateDailyTaskModal } from "../features/dailytasks/CreateDailyTaskModal";
import { DailyTaskRow } from "../features/dailytasks/DailyTaskRow";
import { DailyTaskDetailModal } from "../features/dailytasks/DailyTaskDetailModal";
import {
  useDailyTasks,
  type DailyTask,
} from "../features/dailytasks/useDailyTasks";
import {
  scrollToSection,
  useNotificationTarget,
} from "../lib/useNotificationTarget";
import { ResetRehabButton } from "../components/ResetRehabButton";
import { NotificationBell } from "../components/NotificationBell";

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
  decided_at: string | null;
  decided_by: string | null;
};

const reveal = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export function DaneCockpit() {
  const [addOrderOpen, setAddOrderOpen] = React.useState(false);
  const [toast, setToast] = React.useState("");
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(true);
  const [ordersError, setOrdersError] = React.useState("");

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
        err instanceof Error ? err.message : "Could not load your orders",
      );
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = React.useState(true);
  const [tasksError, setTasksError] = React.useState("");
  const [savingTask, setSavingTask] = React.useState<string | null>(null);
  const [tasksOpen, setTasksOpen] = React.useState(false);
  const [taskDetailId, setTaskDetailId] = React.useState<string | null>(null);
  const [taskFilter, setTaskFilter] = React.useState("All");

  /** Done by Dane, not yet signed off by Raj. */
  const waitingTasks = tasks.filter(
    (task) => task.status === "Done" && !task.approved_at,
  );

  const visibleTasks =
    taskFilter === "All"
      ? tasks
      : taskFilter === "Waiting"
        ? waitingTasks
        : taskFilter === "Approved"
          ? tasks.filter((task) => Boolean(task.approved_at))
          : tasks.filter((task) => task.status === taskFilter);
  const [ordersOpen, setOrdersOpen] = React.useState(false);
  const [orderDetailId, setOrderDetailId] = React.useState<string | null>(null);
  const [orderFilter, setOrderFilter] = React.useState("All");

  /** Waiting means waiting on Raj, which is only the pending ones. */
  const pendingOrders = orders.filter((order) => order.status === "Pending");

  const visibleOrders =
    orderFilter === "All"
      ? orders
      : orders.filter((order) => order.status === orderFilter);

  /* Dane's own daily work, separate from what Raj assigns him. */
  const daily = useDailyTasks();
  const [dailyOpen, setDailyOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [dailyDetailId, setDailyDetailId] = React.useState<string | null>(null);
  const [dailyFilter, setDailyFilter] = React.useState("All");
  const [subsOpen, setSubsOpen] = React.useState(false);
  // The subscriptions card owns the data, so it hands its count up here.
  const [subsCount, setSubsCount] = React.useState<number | null>(null);
  const [completing, setCompleting] = React.useState<DailyTask | null>(null);

  const openTaskCount = tasks.filter((task) => task.status !== "Done").length;
  const [chatTask, setChatTask] = React.useState<Task | null>(null);

  /* Notifications deep-link into here, e.g. /dane?task=<id>&chat=1 */
  const { clear, target } = useNotificationTarget();

  React.useEffect(() => {
    if (target.task) {
      // Wait for the list before deciding the id is missing.
      if (tasksLoading) return;
      const found = tasks.find((task) => task.id === target.task);
      if (found && target.chat) {
        setChatTask(found);
      } else {
        scrollToSection("tasks-heading");
      }
      clear();
      return;
    }

    if (target.order) {
      scrollToSection("orders-heading");
      clear();
      return;
    }

    if (target.stage) clear();
  }, [clear, target, tasks, tasksLoading]);
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

  const loadTasks = React.useCallback(async () => {
    setTasksError("");
    try {
      const res = await apiFetch("/api/tasks");
      if (res.status === 401) {
        setTasks([]);
        return;
      }
      if (!res.ok) throw new Error(`Failed to load tasks (${res.status})`);

      const data = await res.json();
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
      setTasksError(
        err instanceof Error ? err.message : "Could not load your tasks",
      );
    } finally {
      setTasksLoading(false);
    }
  }, []);

  async function updateTaskStatus(id: string, status: Task["status"]) {
    setSavingTask(id);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "PATCH",
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail.slice(0, 160));
      }
      await loadTasks();
    } catch (err) {
      console.error("Failed to update task:", err);
      setTasksError("Could not save that status. Try again.");
    } finally {
      setSavingTask(null);
    }
  }

  React.useEffect(() => {
    loadOrders();
    loadTasks();
    loadCommentCounts();
  }, [loadOrders, loadTasks, loadCommentCounts]);

  // Poll every 30s, but only while the tab is actually visible — no point
  // burning requests on a phone in someone's pocket. Also refresh the moment
  // the tab regains focus, so switching back shows current data immediately.
  React.useEffect(() => {
    const REFRESH_MS = 30_000;

    const timer = setInterval(() => {
      if (!document.hidden) {
        loadOrders();
        loadTasks();
        loadCommentCounts();
      }
    }, REFRESH_MS);

    function handleVisibility() {
      if (!document.hidden) {
        loadOrders();
        loadTasks();
        loadCommentCounts();
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadOrders, loadTasks, loadCommentCounts]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
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
              <NotificationBell />
              <UserMenu />
            </div>
          </div>

          <p className="mt-6 text-[16px] font-medium tracking-[0.14em] text-white/80">
            Executive workspace
          </p>
          <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-[-0.045em] sm:text-[38px] lg:text-[44px]">
            Dane&apos;s Cockpit
          </h1>
          <p className="mt-2 max-w-md text-[18px] font-medium text-white/85">
            Audit and integration status for Lane 2.
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
              <p className="text-[16px] font-semibold tracking-[0.13em] text-[#5B6B82]">
                Personal dashboard
              </p>
              <h2
                className="mt-1 text-[16px] font-semibold tracking-[-0.025em]"
                id="profile-heading"
              >
                Dane · Integration Lead
              </h2>
              <p className="mt-1 text-[16px] font-medium leading-relaxed text-[#64748B]">
                Audits · Access grants · Main Brain integration
              </p>
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
          <h2 className="sr-only" id="queue-heading">
            Your numbers
          </h2>

          <div className="mt-1 grid grid-cols-2 gap-2 sm:gap-4 lg:gap-5">
            <InsightCard
              label="Tasks from Raj"
              onClick={() => setTasksOpen(true)}
              tone="queued"
              value={tasksLoading ? "..." : String(openTaskCount)}
            />
            <InsightCard
              label="Orders to Raj"
              onClick={() => setOrdersOpen(true)}
              tone="critical"
              value={ordersLoading ? "..." : String(orders.length)}
            />
            <InsightCard
              label="Subscriptions"
              onClick={() => setSubsOpen(true)}
              tone="critical"
              value={subsCount === null ? "..." : String(subsCount)}
            />
            {/* The three below all open My tasks, each on its own filter. */}
            <InsightCard
              label="Backlog"
              onClick={() => {
                setDailyFilter("backlog");
                setDailyOpen(true);
              }}
              tone="neutral"
              value={daily.loading ? "..." : String(daily.backlog.length)}
            />
            <InsightCard
              label="To do"
              onClick={() => {
                setDailyFilter("todo");
                setDailyOpen(true);
              }}
              tone="yellow"
              value={daily.loading ? "..." : String(daily.todo.length)}
            />
            <InsightCard
              label="In progress"
              onClick={() => {
                setDailyFilter("in_progress");
                setDailyOpen(true);
              }}
              tone="queued"
              value={daily.loading ? "..." : String(daily.inProgress.length)}
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
            <section aria-labelledby="tasks-heading" className="pt-8">
              <h2 className="sr-only" id="tasks-heading">
                Tasks from Raj
              </h2>
              <NavCard
                count={tasksLoading ? null : openTaskCount}
                icon={<ClipboardListIcon size={17} strokeWidth={2.5} />}
                onClick={() => setTasksOpen(true)}
                subtitle="Work Raj has assigned to you"
                title="Tasks from Raj"
                tone="blue"
              />
            </section>

            <GateQueueModal
              count={tasksLoading ? null : openTaskCount}
              eyebrow="From Raj"
              toolbar={
                <FilterMenu
                  onChange={setTaskFilter}
                  options={[
                    { key: "All", label: "All", count: tasks.length },
                    {
                      key: "Waiting",
                      label: "Waiting on Raj",
                      count: waitingTasks.length,
                    },
                    {
                      key: "Not started",
                      label: "Not started",
                      count: tasks.filter((t) => t.status === "Not started")
                        .length,
                    },
                    {
                      key: "In progress",
                      label: "In progress",
                      count: tasks.filter((t) => t.status === "In progress")
                        .length,
                    },
                    {
                      key: "Blocked",
                      label: "Blocked",
                      count: tasks.filter((t) => t.status === "Blocked").length,
                    },
                    {
                      key: "Approved",
                      label: "Approved",
                      count: tasks.filter((t) => Boolean(t.approved_at)).length,
                    },
                  ]}
                  value={taskFilter}
                />
              }
              onClose={() => setTasksOpen(false)}
              open={tasksOpen}
              title="Tasks from Raj"
            >
              <div className="space-y-3">
                {tasksLoading && (
                  <p className="text-[16px] font-medium text-[#8A99AC]">
                    Loading tasks…
                  </p>
                )}

                {!tasksLoading && tasksError && (
                  <div className="rounded-2xl border border-dashed border-[#FFC9AE] bg-[#FFF6F1] px-5 py-4">
                    <p className="text-[16px] font-medium leading-snug text-[#D95717]">
                      {tasksError}
                    </p>
                    <button
                      className="mt-2 text-[16px] font-semibold tracking-wide text-[#418BFF] hover:underline"
                      onClick={loadTasks}
                      type="button"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!tasksLoading && !tasksError && tasks.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-[#F8FAFC] px-5 py-4">
                    <p className="text-[16px] font-medium leading-snug text-[#8A99AC]">
                      Nothing assigned to you right now.
                    </p>
                  </div>
                )}

                {visibleTasks.map((task) => (
                  <TaskRow
                    commentCount={commentCounts[task.id] ?? 0}
                    key={task.id}
                    onOpen={() => setTaskDetailId(task.id)}
                    task={task}
                    waitingLabel="Waiting on Raj"
                  />
                ))}
              </div>
            </GateQueueModal>

            <section aria-labelledby="orders-heading" className="pt-3">
              <h2 className="sr-only" id="orders-heading">
                Orders to Raj
              </h2>
              <NavCard
                action={
                  <button
                    aria-label="Add an order"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#418BFF] px-2.5 py-1.5 text-[16px] font-semibold tracking-wide text-white transition-colors hover:bg-[#2F6FD8]"
                    onClick={() => setAddOrderOpen(true)}
                    type="button"
                  >
                    <PlusIcon aria-hidden="true" size={12} strokeWidth={3} />
                    {/* Label drops on narrow screens so the card title keeps
                        its single line. The aria-label carries the meaning. */}
                    <span className="hidden sm:inline">Add</span>
                  </button>
                }
                count={ordersLoading ? null : orders.length}
                icon={<FileTextIcon size={17} strokeWidth={2.5} />}
                onClick={() => setOrdersOpen(true)}
                subtitle="Requests you have sent to Raj"
                title="Orders to Raj"
                tone="orange"
              />  
            </section>

            <section aria-labelledby="daily-heading" className="pt-3">
              <h2 className="sr-only" id="daily-heading">
                My tasks
              </h2>
              <NavCard
                action={
                  <button
                    aria-label="New task"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#418BFF] px-2.5 py-1.5 text-[16px] font-semibold tracking-wide text-white transition-colors hover:bg-[#2F6FD8]"
                    onClick={() => setCreateOpen(true)}
                    type="button"
                  >
                    <PlusIcon aria-hidden="true" size={12} strokeWidth={3} />
                    <span className="hidden sm:inline">New</span>
                  </button>
                }
                count={daily.loading ? null : daily.inProgress.length}
                icon={<ListChecksIcon size={17} strokeWidth={2.5} />}
                onClick={() => {
                  setDailyFilter("in_progress");
                  setDailyOpen(true);
                }}
                subtitle={`${daily.backlog.length} backlog · ${daily.todo.length} to do`}
                title="My tasks"
                tone="yellow"
              />
            </section>

            <GateQueueModal
              count={daily.loading ? null : daily.inProgress.length}
              eyebrow="Daily work"
              toolbar={
                <FilterMenu
                  onChange={setDailyFilter}
                  options={[
                    { key: "All", label: "All", count: daily.tasks.length },
                    {
                      key: "backlog",
                      label: "Backlog",
                      count: daily.backlog.length,
                    },
                    {
                      key: "todo",
                      label: "To Do",
                      count: daily.todo.length,
                    },
                    {
                      key: "in_progress",
                      label: "In progress",
                      count: daily.inProgress.length,
                    },
                    {
                      key: "completed",
                      label: "Completed",
                      count: daily.completed.length,
                    },
                  ]}
                  value={dailyFilter}
                />
              }
              onClose={() => setDailyOpen(false)}
              open={dailyOpen}
              title="My tasks"
            >
              <div className="space-y-3">
                {daily.error ? (
                  <p className="text-[16px] font-medium text-[#DC2626]">
                    {daily.error}
                  </p>
                ) : null}

                {!daily.loading && daily.tasks.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-white px-5 py-8 text-center">
                    <p className="text-[16px] font-medium leading-snug text-[#8A99AC]">
                      No tasks yet. Use New task to add one.
                    </p>
                  </div>
                )}

                {(dailyFilter === "All"
                  ? [
                      ...daily.backlog,
                      ...daily.todo,
                      ...daily.inProgress,
                      ...daily.completed,
                    ]
                  : dailyFilter === "backlog"
                    ? daily.backlog
                    : dailyFilter === "todo"
                      ? daily.todo
                      : dailyFilter === "in_progress"
                        ? daily.inProgress
                        : daily.completed
                ).map((task) => (
                  <DailyTaskRow
                    key={task.id}
                    onOpen={() => setDailyDetailId(task.id)}
                    task={task}
                  />
                ))}
              </div>
            </GateQueueModal>

            <section aria-labelledby="subscriptions-heading" className="pt-3">
              <h2 className="sr-only" id="subscriptions-heading">
                Subscriptions
              </h2>
              <SubscriptionsCard
                onCountChange={setSubsCount}
                onOpenChange={setSubsOpen}
                open={subsOpen}
              />
            </section>

            <GateQueueModal
              count={ordersLoading ? null : pendingOrders.length}
              eyebrow="Sent to Raj"
              toolbar={
                <FilterMenu
                  onChange={setOrderFilter}
                  options={[
                    { key: "All", label: "All", count: orders.length },
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
                  ]}
                  value={orderFilter}
                />
              }
              onClose={() => setOrdersOpen(false)}
              open={ordersOpen}
              title="Your orders"
            >
              <div className="space-y-3">
                {ordersLoading && (
                  <p className="text-[16px] font-medium text-[#8A99AC]">
                    Loading orders…
                  </p>
                )}

                {!ordersLoading && ordersError && (
                  <div className="rounded-2xl border border-dashed border-[#FFC9AE] bg-[#FFF6F1] px-5 py-4">
                    <p className="text-[16px] font-medium leading-snug text-[#D95717]">
                      {ordersError}
                    </p>
                    <button
                      className="mt-2 text-[16px] font-semibold tracking-wide text-[#418BFF] hover:underline"
                      onClick={loadOrders}
                      type="button"
                    >
                      Retry
                    </button>
                  </div>
                )}

                {!ordersLoading && !ordersError && orders.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#DCE4EE] bg-[#F8FAFC] px-5 py-4">
                    <p className="text-[16px] font-medium leading-snug text-[#8A99AC]">
                      No orders yet — use Add Order to send one to Raj..
                    </p>
                  </div>
                )}

                {visibleOrders.map((order) => (
                  <OrderRow
                    key={order.id}
                    onOpen={() => setOrderDetailId(order.id)}
                    order={order}
                  />
                ))}
              </div>
            </GateQueueModal>
          </div>
        </motion.div>

        <section aria-labelledby="danger-heading" className="pt-9">
          <SectionHeading id="danger-heading">Danger zone</SectionHeading>
          <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FFF8F4] px-5 py-4">
            <p className="text-[16px] font-medium leading-relaxed text-[#733614]">
              Wipes every rehab photo and approval so the crew starts clean. Use
              this for testing, not once the build is live.
            </p>
            <div className="mt-3">
              <ResetRehabButton />
            </div>
          </div>
        </section>

        <footer className="pt-10 text-center text-[16px] font-medium tracking-[0.12em] text-[#8291A5]">
          Able OS
        </footer>
      </main>

      <OrderDetailModal
        onClose={() => setOrderDetailId(null)}
        open={Boolean(orderDetailId)}
        order={orders.find((order) => order.id === orderDetailId) ?? null}
      />

      <DailyTaskDetailModal
        busy={daily.busyId === dailyDetailId}
        checklist
        onClose={() => setDailyDetailId(null)}
        onComplete={(task) => {
          // Completing needs a note and proof, which lives in its own modal.
          setDailyDetailId(null);
          setCompleting(task);
        }}
        onDelete={(task) => {
          // Close first: the row it was rendered from is about to disappear.
          setDailyDetailId(null);
          daily.deleteTask(task.id);
        }}
        onReopen={(task) => daily.reopenTask(task.id)}
        onSchedule={(task, dueOn) => daily.publishTask(task.id, dueOn)}
        onStart={(task) => daily.startTask(task.id)}
        open={Boolean(dailyDetailId)}
        task={daily.tasks.find((task) => task.id === dailyDetailId) ?? null}
      />

      <CreateDailyTaskModal
        onClose={() => setCreateOpen(false)}
        onCreate={daily.createTask}
        open={createOpen}
      />

      <CompleteDailyTaskModal
        onClose={() => setCompleting(null)}
        onComplete={daily.completeTask}
        open={Boolean(completing)}
        task={completing}
      />

      <TaskDetailModal
        canUpload
        commentCount={taskDetailId ? (commentCounts[taskDetailId] ?? 0) : 0}
        metaLabel="From"
        onClose={() => setTaskDetailId(null)}
        onOpenChat={() => {
          const found = tasks.find((task) => task.id === taskDetailId);
          if (found) setChatTask(found);
        }}
        onStatusChange={(status) => {
          if (taskDetailId) updateTaskStatus(taskDetailId, status);
        }}
        open={Boolean(taskDetailId)}
        saving={savingTask === taskDetailId}
        task={tasks.find((task) => task.id === taskDetailId) ?? null}
      />

      <TaskChatModal
        onChanged={loadCommentCounts}
        onClose={() => setChatTask(null)}
        task={chatTask}
      />

      <AddOrderModal
        open={addOrderOpen}
        onClose={() => setAddOrderOpen(false)}
        onCreated={() => {
          setToast("Order sent to Raj for approval");
          loadOrders();
        }}
      />

      <AnimatePresence>
        {toast && (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-x-0 bottom-6 z-[60] mx-auto flex w-fit max-w-[92vw] items-center gap-3 rounded-2xl bg-[#1A1A2E] px-5 py-3.5 shadow-[0_16px_32px_rgba(26,26,46,0.28)]"
            exit={{ opacity: 0, y: 12 }}
            initial={{ opacity: 0, y: 12 }}
            role="status"
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#16A34A] text-white">
              <CheckIcon aria-hidden="true" size={14} strokeWidth={3} />
            </span>
            <p className="text-[16px] font-medium text-white">{toast}</p>
            <button
              aria-label="Dismiss"
              className="ml-1 shrink-0 text-[16px] font-semibold tracking-wide text-white/60 transition-colors hover:text-white"
              onClick={() => setToast("")}
              type="button"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

type InsightCardProps = {
  label: string;
  value?: string;
  tone: "critical" | "queued" | "success" | "neutral";
  onClick?: () => void;
};
function InsightCard({
  label,
  value,
  tone,
  onClick,
}: Omit<InsightCardProps, "tone"> & {
  tone: "critical" | "queued" | "success" | "yellow" | "neutral";
}) {
  const tones = {
    critical: "text-[#FF7832] bg-[#FFF1E9]",
    queued: "text-[#418BFF] bg-[#EEF5FF]",
    success: "text-[#16A34A] bg-[#EAF8EF]",
    yellow: "text-[#CA8A04] bg-[#FEF9C3]",
    neutral: "text-[#526176] bg-[#F1F5F9]",
  };
  const baseClasses =
    "min-w-0 rounded-2xl border border-[#DCE4EE] bg-white px-3.5 py-4 text-center shadow-[0_4px_12px_rgba(30,58,138,0.045)] sm:px-4 sm:py-5";
  const content = (
    <>
      <p
        className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-[24px] font-semibold leading-none tracking-[-0.06em] sm:text-[27px] ${tones[tone]}`}
      >
        {tone === "success" ? (
          <CheckIcon aria-hidden="true" size={24} strokeWidth={3} />
        ) : (
          value
        )}
      </p>
      <p className="mt-3 text-[14px] font-semibold leading-tight tracking-[0.06em] text-[#718096]">
        {label}
      </p>
    </>
  );
  if (onClick) {
    return (
      <button
        className={`${baseClasses} block w-full cursor-pointer transition-shadow hover:shadow-[0_6px_16px_rgba(30,58,138,0.09)]`}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }
  return <article className={baseClasses}>{content}</article>;
}
type SectionHeadingProps = {
  id: string;
  children: React.ReactNode;
};

function SectionHeading({ id, children }: SectionHeadingProps) {
  return (
    <h2
      className="text-[19px] font-semibold leading-none tracking-[-0.035em] text-[#1A1A2E] sm:text-[21px]"
      id={id}
    >
      {children}
    </h2>
  );
}
