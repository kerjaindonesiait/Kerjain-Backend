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
  if (error || !data) return null;
  return data as JobRow;
}

export async function technicianCanMessageOnJob(jobId: string, technicianId: string): Promise<boolean> {
  const { data: offer } = await db
    .from("offers")
    .select("id")
    .eq("job_id", jobId)
    .eq("technician_id", technicianId)
    .maybeSingle();
  if (offer) return true;

  const job = await getJobForMessaging(jobId);
  return job?.assigned_technician_id === technicianId;
}

export async function canAccessJobMessages(
  job: JobRow,
  viewer: { id: string; role: string },
  technicianId: string,
): Promise<boolean> {
  if (viewer.id === job.user_id) {
    return technicianCanMessageOnJob(job.id, technicianId);
  }
  if (viewer.role === "technician" && viewer.id === technicianId) {
    return job.user_id !== viewer.id && (await technicianCanMessageOnJob(job.id, technicianId));
  }
  return false;
}
