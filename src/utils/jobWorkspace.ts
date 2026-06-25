import { db } from "../db.js";

const ESCROW_AUTO_RELEASE_DAYS = 7;
const WORKSPACE_STATUSES = ["assigned", "in_progress", "completed"] as const;

export type WorkspaceViewer = { id: string; role: string };

export function canAccessJobWorkspace(
  job: { user_id: string; assigned_technician_id: string | null; status: string },
  viewer: WorkspaceViewer,
) {
  if (!WORKSPACE_STATUSES.includes(job.status as (typeof WORKSPACE_STATUSES)[number])) {
    return false;
  }
  if (job.user_id === viewer.id) return true;
  return job.assigned_technician_id === viewer.id && viewer.role === "technician";
}

export function workspaceViewerRole(
  job: { user_id: string; assigned_technician_id: string | null },
  viewer: WorkspaceViewer,
): "owner" | "technician" | null {
  if (job.user_id === viewer.id) return "owner";
  if (job.assigned_technician_id === viewer.id && viewer.role === "technician") return "technician";
  return null;
}

export async function maybeAutoReleaseEscrow(jobId: string) {
  const { data: job } = await db.from("jobs").select("status, completed_at").eq("id", jobId).single();
  if (!job || job.status !== "in_progress" || job.completed_at) return false;

  const { data: payment } = await db
    .from("payments")
    .select("id, status, escrow_release_at")
    .eq("job_id", jobId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!payment?.escrow_release_at) return false;
  if (new Date(payment.escrow_release_at).getTime() > Date.now()) return false;

  const now = new Date().toISOString();
  await db
    .from("jobs")
    .update({ status: "completed", completed_at: now })
    .eq("id", jobId);
  await db
    .from("payments")
    .update({ status: "released", released_at: now })
    .eq("id", payment.id);

  return true;
}

export async function releaseEscrowForJob(jobId: string) {
  const now = new Date().toISOString();
  await db.from("jobs").update({ status: "completed", completed_at: now }).eq("id", jobId);

  const { data: payment } = await db
    .from("payments")
    .select("id")
    .eq("job_id", jobId)
    .in("status", ["success", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (payment) {
    await db
      .from("payments")
      .update({ status: "released", released_at: now })
      .eq("id", payment.id);
  }
}

export function escrowReleaseAtFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + ESCROW_AUTO_RELEASE_DAYS);
  return d.toISOString();
}
