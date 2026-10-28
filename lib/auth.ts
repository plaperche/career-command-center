import "server-only";
import { createClient } from "@supabase/supabase-js";
export async function authenticate(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError(401, "Sign in to continue");
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
      "https://qddptxenlodonpgyeovl.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      "sb_publishable_HVVBZihDFj54x4L0wXzuPw_XW9bI6AN",
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const {
    data: { user },
    error,
  } = await db.auth.getUser(token);
  if (error || !user || user.is_anonymous)
    throw new HttpError(401, "Your session has expired. Sign in again.");
  return { db, user };
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function failure(e: unknown) {
  if (
    e &&
    typeof e === "object" &&
    "code" in e &&
    ["42P01", "PGRST202", "PGRST204"].includes(String(e.code))
  ) {
    e = new HttpError(
      503,
      "The database upgrade is not installed yet. Apply the reviewed Career Command Center migration before using this feature.",
    );
  }
  const status = e instanceof HttpError ? e.status : 400;
  console.error(
    JSON.stringify({
      event: "request_failed",
      status,
      type: e instanceof Error ? e.name : "unknown",
    }),
  );
  return Response.json(
    {
      error:
        e instanceof HttpError
          ? e.message
          : "Request failed validation or could not be completed.",
    },
    { status },
  );
}
export async function body(req: Request) {
  const s = new TextDecoder().decode(await boundedBytes(req, 40000));
  if (s.length > 40000) throw new HttpError(413, "Request too large");
  return JSON.parse(s);
}

export async function boundedBytes(req: Request, limit: number) {
  if (Number(req.headers.get("content-length") || 0) > limit)
    throw new HttpError(413, "Request too large");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
