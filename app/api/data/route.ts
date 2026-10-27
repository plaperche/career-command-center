import { authenticate, body, failure, HttpError } from "@/lib/auth";
import { mutationSchema, validateValues } from "@/lib/schema";
export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const { db } = await authenticate(req);
    const tables = [
      "companies",
      "opportunities",
      "applications",
      "contacts",
      "actions",
      "interactions",
    ];
    const result = await Promise.all(
      tables.map(async (table) => {
        const { data, error } = await db
          .from(table)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return [table, data];
      }),
    );
    return Response.json(Object.fromEntries(result));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const { db, user } = await authenticate(req);
    const input = mutationSchema.parse(await body(req));
    const values = validateValues(input.table, input.values, !!input.id);
    for (const [key, value] of Object.entries(values)) {
      const parent = (
        {
          company_id: "companies",
          opportunity_id: "opportunities",
          contact_id: "contacts",
        } as Record<string, string>
      )[key];
      if (parent && value) {
        const { data, error } = await db
          .from(parent)
          .select("id")
          .eq("id", value)
          .single();
        if (error || !data)
          throw new HttpError(400, "Linked record is not accessible");
      }
    }
    let query = input.id
      ? db
          .from(input.table)
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq("id", input.id)
          .eq("user_id", user.id)
      : db.from(input.table).insert({ ...values, user_id: user.id });
    if (input.id && input.expected_updated_at)
      query = query.eq("updated_at", input.expected_updated_at);
    const { data, error } = await query.select().single();
    if (error) throw error;
    console.info(
      JSON.stringify({
        event: "record_saved",
        table: input.table,
        id: data.id,
      }),
    );
    return Response.json(data);
  } catch (e) {
    return failure(e);
  }
}
