"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/browser";
export default function Matching({
  jobs,
  onSaved,
}: {
  jobs: { id: string; title: string }[];
  onSaved: () => void;
}) {
  const [result, setResult] = useState<any>(null),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function assess(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fd = new FormData(e.currentTarget);
      const id = String(fd.get("id"));
      setSelected(id);
      setResult(
        await (
          await api("/api/match", {
            method: "POST",
            body: JSON.stringify({ id, profile: fd.get("profile") }),
          })
        ).json(),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    try {
      const { reasoning, missing_evidence, ...ratings } = result.assessment;
      await api("/api/data", {
        method: "POST",
        body: JSON.stringify({
          table: "opportunities",
          id: selected,
          values: ratings,
          expected_updated_at: result.expected_updated_at,
          confirmed: true,
        }),
      });
      setResult(null);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="weight-settings">
      <summary>AI match assessment · evidence before assumptions</summary>
      <p>
        Provide your experience and salary expectations. Your profile is sent to
        OpenAI for this assessment and is not retained by this app.
      </p>
      <form onSubmit={assess}>
        <label>
          Saved opportunity
          <select name="id" required>
            <option value="">Choose a role</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Your skills, experience, interests & compensation expectations
          <textarea
            name="profile"
            minLength={50}
            maxLength={15000}
            rows={4}
            required
          />
        </label>
        <button disabled={busy || !jobs.length}>
          {busy ? "Assessing…" : "Assess fit"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div className="proposal">
          <h3>
            {result.match.score ?? "Unknown"} / 100 · {result.match.coverage}%
            evidence coverage
          </h3>
          <p>{result.assessment.reasoning}</p>
          <p>
            Missing evidence:{" "}
            {result.assessment.missing_evidence.join("; ") || "None reported"}
          </p>
          <pre>{JSON.stringify(result.assessment, null, 2)}</pre>
          <details>
            <summary>Separate work authorization evidence</summary>
            <pre>{JSON.stringify(result.authorization, null, 2)}</pre>
          </details>
          <p>
            Review the ratings before saving. This is a provisional assessment,
            not a prediction of hiring success.
          </p>
          <button className="primary" disabled={busy} onClick={save}>
            Confirm & save ratings
          </button>
        </div>
      )}
    </details>
  );
}
