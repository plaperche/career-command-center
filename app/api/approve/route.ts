import { z } from "zod";
import { authenticate, body, failure } from "@/lib/auth";
export async function POST(req: Request) {
  try {
    const { db } = await authenticate(req);
    const input = z
      .object({ id: z.string().uuid(), approve: z.boolean() })
      .strict()
      .parse(await body(req));
    const { data, error } = await db.rpc("cc_decide_proposal", {
      proposal_id: input.id,
      approve: input.approve,
    });
    if (error) throw error;
    return Response.json({ id: data });
  } catch (e) {
    return failure(e);
  }
}
