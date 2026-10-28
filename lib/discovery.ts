import { z } from "zod";
export const sourceSchema = z.object({
  provider: z.enum(["greenhouse", "lever", "ashby"]),
  board: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
  families: z.array(z.string().min(1).max(100)).max(20),
  frequency_hours: z.number().int().min(6).max(168),
  authorized: z.literal(true),
});
export type Job = {
  external_id: string;
  title: string;
  location: string;
  source_url: string;
  description: string;
  compensation?: unknown;
  published_at?: string | null;
};
const safeUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v));
const gh = z.object({
  id: z.number(),
  title: z.string(),
  absolute_url: safeUrl,
  location: z.object({ name: z.string() }),
  content: z.string().optional(),
});
const lever = z.object({
  id: z.string(),
  text: z.string(),
  hostedUrl: safeUrl,
  categories: z.object({ location: z.string().optional() }),
  descriptionPlain: z.string().optional(),
  salaryRange: z.unknown().optional(),
});
const ash = z.object({
  id: z.string().optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  compensation: z.unknown().optional(),
  title: z.string(),
  jobUrl: safeUrl,
  location: z.string(),
  descriptionPlain: z.string().optional(),
  isListed: z.boolean().optional(),
});
export function normalize(provider: string, raw: unknown): Job[] {
  let jobs: Job[];
  if (provider === "greenhouse")
    jobs = z
      .object({ jobs: z.array(gh) })
      .parse(raw)
      .jobs.map((j) => ({
        external_id: String(j.id),
        title: j.title,
        source_url: j.absolute_url,
        location: j.location.name,
        description: (j.content || "").replace(/<[^>]*>/g, " "),
      }));
  else if (provider === "lever")
    jobs = z
      .array(lever)
      .parse(raw)
      .map((j) => ({
        external_id: j.id,
        title: j.text,
        source_url: j.hostedUrl,
        location: j.categories.location || "",
        description: j.descriptionPlain || "",
        compensation: j.salaryRange ?? null,
      }));
  else
    jobs = z
      .object({ jobs: z.array(ash) })
      .parse(raw)
      .jobs.filter((j) => j.isListed !== false)
      .map((j) => ({
        external_id: j.id || j.jobUrl,
        compensation: j.compensation ?? null,
        published_at: j.publishedAt ?? null,
        title: j.title,
        source_url: j.jobUrl,
        location: j.location,
        description: j.descriptionPlain || "",
      }));
  return [...new Map(jobs.map((j) => [j.external_id, j])).values()];
}
export class SourceError extends Error {
  constructor(
    message: string,
    public retrySeconds = 3600,
  ) {
    super(message);
  }
}
export async function fetchBoard(
  provider: "greenhouse" | "lever" | "ashby",
  board: string,
  fetcher = fetch,
) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(board))
    throw new SourceError("Invalid board");
  const urls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${board}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
  };
  const response = await fetcher(urls[provider], {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: {
      Accept: "application/json",
      "User-Agent": "CareerCommandCenter/2.0",
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const seconds = retry
      ? Number(retry) || Math.ceil((Date.parse(retry) - Date.now()) / 1000)
      : 3600;
    throw new SourceError(
      `Source HTTP ${response.status}`,
      Math.min(86400, Math.max(3600, seconds || 3600)),
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new SourceError("Source returned no body");
  const decoder = new TextDecoder();
  let text = "",
    bytes = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 10000000) {
      await reader.cancel();
      throw new SourceError("Source exceeds 10 MB limit");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return normalize(provider, JSON.parse(text));
}
