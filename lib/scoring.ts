export const weights = {
  fit_score: 25,
  salary_score: 25,
  growth_score: 20,
  location_score: 15,
  interest_score: 15,
};
export function score(values: Record<string, unknown>, custom = weights) {
  let earned = 0,
    coverage = 0;
  for (const [key, weight] of Object.entries(custom)) {
    const v = values[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 1 && v <= 5) {
      earned += (v / 5) * weight;
      coverage += weight;
    }
  }
  const total = Object.values(custom).reduce((a, b) => a + b, 0);
  return {
    score: coverage ? Math.round((earned / coverage) * 100) : null,
    coverage: total ? Math.round((coverage / total) * 100) : 0,
    missing: Object.keys(custom).filter((k) => typeof values[k] !== "number"),
  };
}
export function authorizationEvidence(text: string) {
  // Evidence flags are not a determination of legal eligibility; retain source wording for review.
  const phrases = text.split(/(?<=[!?])\s+|\n+|(?<=\.)\s+(?=[A-Z])/);
  const evidence = (re: RegExp) =>
    phrases.filter((p) => re.test(p)).slice(0, 5);
  return {
    eligibility: "Unknown — verify with employer",
    citizenship: evidence(/U\.?S\.? citizen|United States citizen/i),
    itar: evidence(/\bITAR\b|export.control|U\.?S\.? person/i),
    f1_opt: evidence(/\b(?:F-1|STEM OPT|OPT)\b/i),
    stem_opt: evidence(/\bSTEM OPT\b/i),
    sponsorship: evidence(/sponsor(?:ship)?|work authoriz/i),
  };
}
