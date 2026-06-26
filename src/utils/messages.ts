import { db } from "../db.js";

type JobRow = {
  id: string;
  user_id: string;
  assigned_technician_id: string | null;
  status: string;
  title: string;
};

export async function getJobForMessaging(jobId: string): Promise<JobRow | null> {
  const { data, error } = await db
    .from("jobs")
    .select("id, user_id, assigned_technician_id, status, title")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Technician may message if they have any offer on the job or are assigned. */
export async function technicianCanMessageOnJob(jobId: string, technicianId: string): Promise<boolean> {
  const { data: job } = await db
    .from("jobs")
    .select("assigned_technician_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return false;
  if (job.assigned_technician_id === technicianId) return true;

  const { count } = await db
    .from("offers")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("technician_id", technicianId);
  return (count ?? 0) > 0;
}

export async function resolvePeerId(
  job: JobRow,
  viewerId: string,
  viewerRole: string,
  peerId?: string,
): Promise<string | null> {
  if (viewerRole === "technician") {
    if (job.user_id === viewerId) return null;
    const allowed = await technicianCanMessageOnJob(job.id, viewerId);
    return allowed ? job.user_id : null;
  }

  if (job.user_id !== viewerId) return null;
  if (!peerId) return job.assigned_technician_id;
  const allowed = await technicianCanMessageOnJob(job.id, peerId);
  return allowed ? peerId : null;
}

export async function getOrCreateThread(jobId: string, technicianId: string) {
  const { data: existing } = await db
    .from("job_message_threads")
    .select("id, job_id, technician_id, created_at, updated_at")
    .eq("job_id", jobId)
    .eq("technician_id", technicianId)
    .maybeSingle();

  if (existing) return existing;

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("job_message_threads")
    .insert({ job_id: jobId, technician_id: technicianId, updated_at: now })
    .select("id, job_id, technician_id, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}
