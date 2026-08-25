// api/index.js
// Single serverless function that dispatches every /api/* request to the
// matching handler in /routes.
//
// Vercel counts each file in /api as one function, and the Hobby plan caps a
// deployment at 12. Keeping the handlers outside /api means they no longer
// count, so endpoints can be added freely from here on.

import approveStage from "../routes/approve-stage.js";
import criticalDates from "../routes/critical-dates.js";
import dailyTaskItems from "../routes/daily-task-items.js";
import dailyTasks from "../routes/daily-tasks.js";
import dealIntake from "../routes/deal-intake.js";
import dealIntakeFile from "../routes/deal-intake-file.js";
import intakeHealth from "../routes/intake-health.js";
import dealSubmission from "../routes/deal-submission.js";
import dealUploadUrl from "../routes/deal-upload-url.js";
import dealFiles from "../routes/deal-files.js";
import driveFolders from "../routes/drive-folders.js";
import deals from "../routes/deals.js";
import documents from "../routes/documents.js";
import driveUploadUrl from "../routes/drive-upload-url.js";
import leads from "../routes/leads.js";
import notifications from "../routes/notifications.js";
import orders from "../routes/orders.js";
import pipelineDeals from "../routes/pipeline-deals.js";
import pof from "../routes/pof.js";
import pushSubscribe from "../routes/push-subscribe.js";
import rehabStages from "../routes/rehab-stages.js";
import resetRehab from "../routes/reset-rehab.js";
import subscriptionIntake from "../routes/subscription-intake.js";
import subscriptions from "../routes/subscriptions.js";
import taskComments from "../routes/task-comments.js";
import taskEvidence from "../routes/task-evidence.js";
import tasks from "../routes/tasks.js";
import unitInspectionDrive from "../routes/unit-inspection-drive.js";
import unitInspections from "../routes/unit-inspections.js";

/** Longest job is the rehab reset, which purges Drive and Notion. */
export const config = { maxDuration: 60 };

const ROUTES = {
    "approve-stage": approveStage,
    "critical-dates": criticalDates,
    "daily-task-items": dailyTaskItems,
    "daily-tasks": dailyTasks,
    "deal-intake": dealIntake,
    "deal-intake-file": dealIntakeFile,
    "intake-health": intakeHealth,
    "deal-submission": dealSubmission,
    "deal-upload-url": dealUploadUrl,
    "deal-files": dealFiles,
    "drive-folders": driveFolders,
    deals,
    documents,
    "drive-upload-url": driveUploadUrl,
    leads,
    notifications,
    orders,
    "pipeline-deals": pipelineDeals,
    pof,
    "push-subscribe": pushSubscribe,
    "rehab-stages": rehabStages,
    "reset-rehab": resetRehab,
    "subscription-intake": subscriptionIntake,
    subscriptions,
    "task-comments": taskComments,
    "task-evidence": taskEvidence,
    tasks,
    "unit-inspection-drive": unitInspectionDrive,
    "unit-inspections": unitInspections,
};

export default async function handler(req, res) {
    // The rewrite passes the original path through as __path. Fall back to
    // reading the URL directly, which is what happens under vercel dev.
    const raw = req.query?.__path;
    let name = Array.isArray(raw) ? raw[0] : raw;

    if (!name) {
        const url = new URL(req.url, "http://localhost");
        name = url.pathname.replace(/^\/api\/?/, "").split("/")[0];
    }

    name = String(name || "").split("?")[0];

    // Own-property check only. ROUTES["constructor"] would otherwise resolve
    // up the prototype chain and get called as a handler.
    const route = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;

    if (typeof route !== "function") {
        return res.status(404).json({ error: `Unknown endpoint: ${name}` });
    }

    // Keep the router's own parameter out of the handlers.
    if (req.query) delete req.query.__path;

    return route(req, res);
}