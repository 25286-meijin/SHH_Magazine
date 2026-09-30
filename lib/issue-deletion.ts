import { createServiceSupabaseClient } from "@/lib/supabase/server";

type ServiceClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;
type StorageFile = { id?: string | null; name: string };

const PUBLIC_BUCKET = "magazine-public";
const STAGING_BUCKET = "magazine-staging";
const PAGE_SIZE = 1_000;
const REMOVE_BATCH_SIZE = 100;

export type StorageCleanupResult = {
  publicFiles: string[];
  stagingFiles: string[];
};

export async function cleanupIssueStorage(
  supabase: ServiceClient,
  issueIds: string[],
  knownPublicPaths: string[],
): Promise<StorageCleanupResult> {
  const storageIssueIds = [...new Set(issueIds)];
  if (!storageIssueIds.length || storageIssueIds.some((issueId) => !/^\d{4}-(0[1-9]|1[0-2])$/.test(issueId))) {
    throw new Error("醫訊期號格式不正確");
  }

  const publicCandidates = new Set<string>(knownPublicPaths);
  for (const storageIssueId of storageIssueIds) {
    publicCandidates.add(`${storageIssueId}.pdf`);
    publicCandidates.add(`${storageIssueId}.jpg`);
    for (const path of await listStorageFiles(supabase, PUBLIC_BUCKET, `issues/${storageIssueId}`)) {
      publicCandidates.add(path);
    }
    for (const path of await listStorageFiles(supabase, PUBLIC_BUCKET, `covers/${storageIssueId}`)) {
      publicCandidates.add(path);
    }
  }
  const stagingFiles = (await listStorageFiles(supabase, STAGING_BUCKET, ""))
    .filter((path) => storageIssueIds.some((storageIssueId) => matchesIssueAssetFile(path, storageIssueId)));

  const publicFiles = [...publicCandidates].filter(Boolean);
  await removeStorageFiles(supabase, PUBLIC_BUCKET, publicFiles);
  await removeStorageFiles(supabase, STAGING_BUCKET, stagingFiles);

  const [remainingPublic, remainingStaging] = await Promise.all([
    listStorageFiles(supabase, PUBLIC_BUCKET, ""),
    listStorageFiles(supabase, STAGING_BUCKET, ""),
  ]);
  const publicRemainder = remainingPublic.filter((path) => publicFiles.includes(path)
    || storageIssueIds.some((storageIssueId) =>
      path.startsWith(`issues/${storageIssueId}/`)
      || path.startsWith(`covers/${storageIssueId}/`)
      || path === `${storageIssueId}.pdf`
      || path === `${storageIssueId}.jpg`,
    ));
  const stagingRemainder = remainingStaging.filter(
    (path) => storageIssueIds.some((storageIssueId) => matchesIssueAssetFile(path, storageIssueId)),
  );
  if (publicRemainder.length || stagingRemainder.length) {
    throw new Error("Storage 尚有此期檔案，請安全重試清理");
  }

  return { publicFiles, stagingFiles };
}

function matchesIssueAssetFile(path: string, storageIssueId: string) {
  const fileName = path.split("/").at(-1);
  return fileName === `${storageIssueId}.pdf` || fileName === `${storageIssueId}.jpg`;
}

async function listStorageFiles(
  supabase: ServiceClient,
  bucketName: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (depth > 5) throw new Error(`Storage 路徑層級異常：${bucketName}/${prefix}`);
  const bucket = supabase.storage.from(bucketName);
  const entries: StorageFile[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await bucket.list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    entries.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id) files.push(path);
    else files.push(...await listStorageFiles(supabase, bucketName, path, depth + 1));
  }
  return files;
}

async function removeStorageFiles(
  supabase: ServiceClient,
  bucketName: string,
  paths: string[],
) {
  const bucket = supabase.storage.from(bucketName);
  for (let index = 0; index < paths.length; index += REMOVE_BATCH_SIZE) {
    const { error } = await bucket.remove(paths.slice(index, index + REMOVE_BATCH_SIZE));
    if (error) throw error;
  }
}
