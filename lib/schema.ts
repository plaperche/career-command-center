import { z } from "zod";
const text = z.string().trim().max(8000).nullable().optional();
const short = z.string().trim().max(300).nullable().optional();
const required = z.string().trim().min(1).max(300);
const date = z.string().date().nullable().optional();
const uuid = z.string().uuid().nullable().optional();
const url = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//.test(v), "Use an http(s) URL")
  .nullable()
  .optional();
const rating = z.number().int().min(1).max(5).nullable().optional();
export const schemas = {
  companies: z
    .object({
      name: required,
      website: url,
      career_url: url,
      sector: short,
      location: short,
      priority: z.enum(["Watchlist", "High", "Medium", "Low"]).optional(),
      notes: text,
      fit_score: rating,
      salary_score: rating,
      growth_score: rating,
      location_score: rating,
      interest_score: rating,
    })
    .strict(),
  opportunities: z
    .object({
      title: required,
      fit_score: rating,
      salary_score: rating,
      growth_score: rating,
      location_score: rating,
      interest_score: rating,
      company_id: uuid,
      location: short,
      job_url: url,
      salary_min: z.number().nonnegative().nullable().optional(),
      salary_max: z.number().nonnegative().nullable().optional(),
      status: z.enum(["Discovered", "Shortlisted", "Closed"]).optional(),
      deadline: date,
      notes: text,
    })
    .strict(),
  applications: z
    .object({
      role_title: required,
      company_id: uuid,
      opportunity_id: uuid,
      status: z
        .enum([
          "Planning",
          "Preparing",
          "Applied",
          "Screening",
          "Interview",
          "Offer",
          "Rejected",
          "Withdrawn",
        ])
        .optional(),
      applied_on: date,
      next_followup: date,
      notes: text,
    })
    .strict(),
  contacts: z
    .object({
      full_name: required,
      company_id: uuid,
      job_title: short,
      email: z.string().email().nullable().optional(),
      linkedin_url: url,
      status: short,
      next_followup: date,
      notes: text,
    })
    .strict(),
  actions: z
    .object({
      title: required,
      company_id: uuid,
      kind: short,
      status: z.enum(["Todo", "In progress", "Done"]).optional(),
      priority: z.enum(["High", "Medium", "Low"]).optional(),
      due_on: date,
      notes: text,
    })
    .strict(),
  interactions: z
    .object({
      summary: required,
      company_id: uuid,
      contact_id: uuid,
      channel: short,
      next_step: text,
    })
    .strict(),
};
export const tableSchema = z.enum([
  "companies",
  "opportunities",
  "applications",
  "contacts",
  "actions",
  "interactions",
]);
export const mutationSchema = z
  .object({
    table: tableSchema,
    id: z.string().uuid().optional(),
    values: z.record(z.string(), z.unknown()),
    confirmed: z.literal(true),
    expected_updated_at: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export function validateValues(
  table: keyof typeof schemas,
  values: unknown,
  update = false,
) {
  const parsed = (update ? schemas[table].partial() : schemas[table]).parse(
    values,
  );
  if (!Object.keys(parsed).length) throw Error("No changes supplied");
  if (
    "salary_min" in parsed &&
    "salary_max" in parsed &&
    typeof parsed.salary_min === "number" &&
    typeof parsed.salary_max === "number" &&
    parsed.salary_min > parsed.salary_max
  )
    throw Error("Salary minimum exceeds maximum");
  return parsed;
}
