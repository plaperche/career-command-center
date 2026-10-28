import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { authenticate, body, failure, HttpError } from "@/lib/auth";
import { sourceSchema, fetchBoard, SourceError } from "@/lib/discovery";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.get("cron") === "1")
      return await scan(req);
    const { db } = await authenticate(req);
    const [sources, jobs] = await Promise.all([
      db.from("cc_sources").select("*"),
      db
        .from("cc_discovered_jobs")
        .select("*")
        .order("discovered_at", { ascending: false })
        .limit(500),
    ]);
    if (sources.error || jobs.error) throw sources.error || jobs.error;
    return Response.json({ sources: sources.data, jobs: jobs.data });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { db } = await authenticate(req);
    const input = sourceSchema.parse(await body(req));
    const { data, error } = await db
      .from("cc_sources")
      .upsert(input, { onConflict: "user_id,provider,board" })
      .select()
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
async function scan(req: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = req.headers.get("authorization") || "";
  if (
    !secret ||
    supplied.length !== `Bearer ${secret}`.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(`Bearer ${secret}`))
  )
    throw new HttpError(401, "Unauthorized");
  if (!process.env.SUPABASE_SECRET_KEY)
    throw new HttpError(503, "Discovery worker is not configured");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY,
    { auth: { persistSession: false } },
  );
  const { data: sources, error } = await db.rpc("cc_claim_sources");
  if (error) throw error;
  const results = [];
  for (const source of sources || []) {
    try {
      const all = await fetchBoard(source.provider, source.board);
      const { error: commitError } = await db.rpc("cc_commit_scan", {
        source: source.id,
        jobs: all,
        scanned_at: new Date().toISOString(),
      });
      if (commitError) throw commitError;
      results.push({ id: source.id, status: "ok", count: all.length });
    } catch (e) {
      const retry = e instanceof SourceError ? e.retrySeconds : 3600;
      await db
        .from("cc_sources")
        .update({
          last_error:
            e instanceof SourceError
              ? e.message
              : "Scan failed; no closure changes applied",
          next_scan: new Date(Date.now() + retry * 1000).toISOString(),
        })
        .eq("id", source.id);
      results.push({ id: source.id, status: "failed" });
    }
  }
  return Response.json({ results });
}

export async function PATCH(req: Request) {
  try {
    const { db } = await authenticate(req);
    const input = z
      .object({
        id: z.string().uuid(),
        enabled: z.boolean(),
        confirmed: z.literal(true),
      })
      .strict()
      .parse(await body(req));
    const { data, error } = await db
      .from("cc_sources")
      .update({ enabled: input.enabled })
      .eq("id", input.id)
      .select()
      .single();
    if (error) throw error;
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
