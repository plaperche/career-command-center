import { describe, it, expect, vi } from "vitest";
import { score, weights, authorizationEvidence } from "../lib/scoring";
import { mutationSchema, validateValues } from "../lib/schema";
import { normalize, fetchBoard, SourceError } from "../lib/discovery";
describe("transparent scoring", () => {
  it("uses the requested 25/25/20/15/15 weights", () => {
    expect(
      score({
        fit_score: 5,
        salary_score: 1,
        growth_score: 1,
        location_score: 1,
        interest_score: 1,
      }).score,
    ).toBe(40);
    expect(Object.values(weights).reduce((a, b) => a + b)).toBe(100);
  });
  it("does not fabricate salary evidence", () => {
    expect(
      score({
        fit_score: 5,
        growth_score: 5,
        location_score: 5,
        interest_score: 5,
      }),
    ).toEqual({ score: 100, coverage: 75, missing: ["salary_score"] });
  });
  it("leaves an unscored job unknown", () =>
    expect(score({}).score).toBeNull());
  it("rejects nonfinite or out-of-range evidence", () =>
    expect(score({ fit_score: NaN, salary_score: 6 }).coverage).toBe(0));
  it("keeps authorization unknown even with restrictive language", () => {
    const x = authorizationEvidence(
      "Must be a U.S. citizen. ITAR applies. STEM OPT considered.",
    );
    expect(x.eligibility).toContain("Unknown");
    expect(x.citizenship.length).toBe(1);
    expect(x.itar.length).toBe(1);
    expect(x.f1_opt.length).toBe(1);
  });
});
describe("mutation boundaries", () => {
  it("requires explicit confirmation", () =>
    expect(() =>
      mutationSchema.parse({
        table: "actions",
        values: { title: "Follow up" },
      }),
    ).toThrow());
  it("rejects ownership and arbitrary column injection", () =>
    expect(() =>
      validateValues("companies", { name: "Test", user_id: "other-user" }),
    ).toThrow());
  it("rejects unsafe external links", () =>
    expect(() =>
      validateValues("opportunities", {
        title: "Role",
        job_url: "javascript:alert(1)",
      }),
    ).toThrow());
  it("rejects invalid status and salary range", () => {
    expect(() =>
      validateValues("opportunities", { status: "Offer" }, true),
    ).toThrow();
    expect(() =>
      validateValues("opportunities", {
        title: "Role",
        salary_min: 100,
        salary_max: 50,
      }),
    ).toThrow();
  });
  it("permits a bounded partial update", () =>
    expect(validateValues("actions", { status: "Done" }, true)).toEqual({
      status: "Done",
    }));
});
describe("ATS ingestion", () => {
  const job = {
    id: 42,
    title: "Systems engineer",
    absolute_url: "https://example.com/job/42",
    location: { name: "New York" },
    content: "<p>Systems</p>",
  };
  it("deduplicates by source job identifier", () =>
    expect(normalize("greenhouse", { jobs: [job, job] })).toHaveLength(1));
  it("preserves verified source URLs", () =>
    expect(normalize("greenhouse", { jobs: [job] })[0].source_url).toBe(
      job.absolute_url,
    ));
  it("refuses malformed feeds rather than interpreting as closed", () =>
    expect(() => normalize("greenhouse", { error: "try later" })).toThrow());
  it("blocks arbitrary host/path injection", async () => {
    const f = vi.fn();
    await expect(fetchBoard("lever", "../../evil", f)).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
  it("returns rate limits without retry storms", async () => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "Retry-After": "7200" } }),
      );
    await expect(fetchBoard("lever", "example", f)).rejects.toMatchObject({
      retrySeconds: 7200,
    });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("excludes unlisted Ashby jobs", () =>
    expect(
      normalize("ashby", {
        jobs: [
          {
            id: "1",
            title: "Hidden",
            jobUrl: "https://example.com",
            location: "NY",
            isListed: false,
          },
        ],
      }),
    ).toEqual([]));
});

it("accepts the documented Ashby feed without a separate id", () => {
  const url = "https://jobs.ashbyhq.com/example/123";
  expect(
    normalize("ashby", {
      jobs: [{ title: "Engineer", jobUrl: url, location: "NY" }],
    })[0].external_id,
  ).toBe(url);
});
