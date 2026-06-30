import { db } from "../db.js";

export const JOB_BUCKET = "job-photos";

export function isOwnedJobPhotoPath(path: string, userId: string): boolean {
  return path.startsWith(`draft/${userId}/`) || path.startsWith(`${userId}/`);
}

/** Extract storage path from a public URL or return the path as-is. */
export function extractJobPhotoPath(ref: string): string | null {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("://")) return trimmed;

  const marker = `/storage/v1/object/public/${JOB_BUCKET}/`;
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(trimmed.slice(idx + marker.length));
}

export function publicUrlForJobPhotoPath(path: string): string {
  const { data } = db.storage.from(JOB_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export function resolveJobPhotoUrls(refs: string[] | null | undefined): string[] {
  if (!refs?.length) return [];
  return refs
    .map((ref) => {
      if (ref.startsWith("http")) return ref;
      const path = extractJobPhotoPath(ref);
      return path ? publicUrlForJobPhotoPath(path) : null;
    })
    .filter((url): url is string => !!url);
}

/** Normalize upload refs (paths or public URLs) to owned storage paths for DB. */
export function normalizeJobPhotoRefs(photos: unknown, userId: string): string[] {
  if (!Array.isArray(photos)) return [];

  const out: string[] = [];
  for (const raw of photos) {
    if (typeof raw !== "string") continue;
    const path = extractJobPhotoPath(raw);
    if (path && isOwnedJobPhotoPath(path, userId)) {
      out.push(path);
    }
  }
  return out.slice(0, 3);
}
