import { createClient } from "@supabase/supabase-js";
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://qddptxenlodonpgyeovl.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    "sb_publishable_HVVBZihDFj54x4L0wXzuPw_XW9bI6AN",
);
export async function api(path: string, options: RequestInit = {}) {
  const {
    data: { session },
  } = await db.auth.getSession();
  const response = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${session?.access_token || ""}`,
    },
  });
  if (!response.ok) {
    const data = await response.json();
    throw Error(data.error || "Request failed");
  }
  return response;
}
