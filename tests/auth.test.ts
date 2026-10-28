import { it, expect, vi } from "vitest";
const getUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));
import { authenticate } from "../lib/auth";
it("rejects missing credentials before database access", async () => {
  await expect(
    authenticate(new Request("https://app.test/api/data")),
  ).rejects.toMatchObject({ status: 401 });
  expect(getUser).not.toHaveBeenCalled();
});
it("verifies bearer token with Supabase Auth", async () => {
  getUser.mockResolvedValue({
    data: { user: null },
    error: { message: "invalid" },
  });
  await expect(
    authenticate(
      new Request("https://app.test", {
        headers: { authorization: "Bearer invalid" },
      }),
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(getUser).toHaveBeenCalledWith("invalid");
});
it("rejects anonymous authenticated users", async () => {
  getUser.mockResolvedValue({
    data: { user: { id: "x", is_anonymous: true } },
    error: null,
  });
  await expect(
    authenticate(
      new Request("https://app.test", {
        headers: { authorization: "Bearer token" },
      }),
    ),
  ).rejects.toMatchObject({ status: 401 });
});
it("uses a verified identity", async () => {
  getUser.mockResolvedValue({
    data: { user: { id: "owner", is_anonymous: false } },
    error: null,
  });
  expect(
    (
      await authenticate(
        new Request("https://app.test", {
          headers: { authorization: "Bearer token" },
        }),
      )
    ).user.id,
  ).toBe("owner");
});
