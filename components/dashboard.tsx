"use client";
import { useState, useEffect, type FormEvent } from "react";
import {
  LayoutDashboard,
  Building2,
  BriefcaseBusiness,
  Columns3,
  Users,
  CalendarDays,
  ChartNoAxesCombined,
  Sparkles,
  Search,
  Plus,
  ArrowUpRight,
  ChevronRight,
  LogOut,
  Compass,
  FileText,
  Check,
  Orbit,
  Menu,
  X,
  Send,
  Download,
  ShieldCheck,
} from "lucide-react";
import { db, api } from "@/lib/browser";
import { score, weights, authorizationEvidence } from "@/lib/scoring";
import Matching from "./matching";
import type { User } from "@supabase/supabase-js";
type Row = Record<string, any>;
type Data = Record<string, Row[]>;
const nav = [
  ["overview", "Overview", LayoutDashboard],
  ["companies", "Companies", Building2],
  ["opportunities", "Opportunities", BriefcaseBusiness],
  ["applications", "Applications", Columns3],
  ["contacts", "Networking", Users],
  ["actions", "Activity planner", CalendarDays],
  ["analytics", "Analytics", ChartNoAxesCombined],
  ["discovery", "Job discovery", Compass],
  ["resume", "Resume intelligence", FileText],
  ["copilot", "Career Copilot", Sparkles],
] as const;
const stages = [
  "Planning",
  "Preparing",
  "Applied",
  "Screening",
  "Interview",
  "Offer",
  "Rejected",
  "Withdrawn",
];
const fields: Record<string, string[]> = {
  companies: [
    "name",
    "sector",
    "location",
    "website",
    "career_url",
    "priority",
    "fit_score",
    "salary_score",
    "growth_score",
    "location_score",
    "interest_score",
    "notes",
  ],
  opportunities: [
    "title",
    "company_id",
    "location",
    "job_url",
    "salary_min",
    "salary_max",
    "fit_score",
    "salary_score",
    "growth_score",
    "location_score",
    "interest_score",
    "status",
    "deadline",
    "notes",
  ],
  applications: [
    "role_title",
    "company_id",
    "opportunity_id",
    "status",
    "applied_on",
    "next_followup",
    "notes",
  ],
  contacts: [
    "full_name",
    "company_id",
    "job_title",
    "email",
    "linkedin_url",
    "status",
    "next_followup",
    "notes",
  ],
  actions: [
    "title",
    "company_id",
    "kind",
    "priority",
    "status",
    "due_on",
    "notes",
  ],
  interactions: ["summary", "company_id", "contact_id", "channel", "next_step"],
};
const statuses: Record<string, string[]> = {
  companies: ["Watchlist", "High", "Medium", "Low"],
  opportunities: ["Discovered", "Shortlisted", "Closed"],
  applications: stages,
  actions: ["Todo", "In progress", "Done"],
  contacts: ["Identified", "Contacted", "Responded", "Follow-up"],
};
const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (s: string) =>
  s
    ? new Date(s + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "No date";
function Empty({
  text = "Your next chapter starts here.",
  detail = "Add your first record to build a clearer picture.",
  onAdd,
}: {
  text?: string;
  detail?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Orbit size={28} />
      </div>
      <h3>{text}</h3>
      <p>{detail}</p>
      {onAdd && (
        <button onClick={onAdd}>
          Add your first record <Plus size={15} />
        </button>
      )}
    </div>
  );
}
export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true,
      authEventReceived = false;
    const { data: subscription } = db.auth.onAuthStateChange((_, session) => {
      authEventReceived = true;
      if (alive) {
        setUser(session?.user || null);
        setReady(true);
      }
    });
    void db.auth.getSession().then(({ data }) => {
      if (alive && !authEventReceived) {
        setUser(data.session?.user || null);
        setReady(true);
      }
    });
    return () => {
      alive = false;
      subscription.subscription.unsubscribe();
    };
  }, []);
  return <Workspace key={user?.id || "signed-out"} user={user} ready={ready} />;
}
function Workspace({ user, ready }: { user: User | null; ready: boolean }) {
  const [view, setView] = useState("overview"),
    [data, setData] = useState<Data>({}),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(false),
    [editor, setEditor] = useState<{ table: string; row?: Row } | null>(null),
    [menu, setMenu] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState(""),
    [sort, setSort] = useState("recent");
  const [chat, setChat] = useState<Row[]>([]),
    [conversations, setConversations] = useState<Row[]>([]),
    [conversationId, setConversationId] = useState<string>(),
    [proposals, setProposals] = useState<Row[]>([]),
    [progress, setProgress] = useState(""),
    [sources, setSources] = useState<Row[]>([]),
    [jobs, setJobs] = useState<Row[]>([]),
    [report, setReport] = useState("");
  const [customWeights, setCustomWeights] = useState(weights);
  const [plannerRange, setPlannerRange] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");
  const [minSalary, setMinSalary] = useState("");
  useEffect(() => {
    if (user) {
      const raw = localStorage.getItem("ccc-weights-" + user.id);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (
            Object.keys(weights).every(
              (k) =>
                typeof parsed[k] === "number" &&
                parsed[k] >= 0 &&
                parsed[k] <= 100,
            )
          )
            setCustomWeights(parsed);
        } catch {}
      }
    }
  }, [user?.id]);
  function updateWeights(next: typeof weights) {
    setCustomWeights(next);
    if (user)
      localStorage.setItem("ccc-weights-" + user.id, JSON.stringify(next));
  }

  async function load() {
    setLoading(true);
    try {
      setData(await (await api("/api/data")).json());
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user) void load();
  }, [user?.id]);
  useEffect(() => {
    setQuery("");
    setFilter("");
    if (user && view === "copilot") void loadChats();
    if (user && view === "discovery") void loadDiscovery();
  }, [view, user?.id]);
  async function loadChats(id?: string) {
    try {
      const res = await (
        await api("/api/chat" + (id ? "?id=" + id : ""))
      ).json();
      if (id) setChat(res.items);
      else setConversations(res.items);
      setProposals(res.proposals);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadDiscovery() {
    try {
      const res = await (await api("/api/discovery")).json();
      setSources(res.sources);
      setJobs(res.jobs);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function navigate(v: string) {
    setView(v);
    setMenu(false);
  }
  const companies = data.companies || [],
    opportunities = data.opportunities || [],
    applications = data.applications || [],
    actions = data.actions || [];
  const company = (id: string) =>
    companies.find((c) => c.id === id)?.name || "Independent";
  const pending = actions
    .filter((a) => a.status !== "Done")
    .sort((a, b) => (a.due_on || "9999").localeCompare(b.due_on || "9999"));
  const followups: Row[] = [
    ...(data.contacts || []).map((r): Row => ({
      ...r,
      table: "contacts",
      title: r.full_name,
    })),
    ...applications.map((r): Row => ({
      ...r,
      table: "applications",
      title: r.role_title,
    })),
  ]
    .filter((r) => r.next_followup)
    .sort((a, b) => a.next_followup.localeCompare(b.next_followup));
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editor) return;
    setLoading(true);
    try {
      const fd = new FormData(e.currentTarget),
        values: Row = {};
      for (const [k, v] of fd) {
        values[k] =
          v === ""
            ? null
            : k.endsWith("_score") || k.startsWith("salary_")
              ? Number(v)
              : v;
      }
      await api("/api/data", {
        method: "POST",
        body: JSON.stringify({
          table: editor.table,
          id: editor.row?.id,
          values,
          confirmed: true,
        }),
      });
      setEditor(null);
      setNotice("Changes saved.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const message = String(new FormData(form).get("message") || "");
    if (!message.trim() || loading) return;
    form.reset();
    setChat((c) => [
      ...c,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    setLoading(true);
    setProgress("Connecting to your copilot");
    try {
      const response = await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message, conversationId }),
      });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line);
          if (event.event === "conversation") setConversationId(event.data);
          if (event.event === "progress") setProgress(event.data);
          if (event.event === "delta")
            setChat((c) =>
              c.map((m, i) =>
                i === c.length - 1
                  ? { ...m, content: m.content + event.data }
                  : m,
              ),
            );
          if (event.event === "proposal")
            setProposals((p) => [...p, event.data]);
          if (event.event === "error") throw Error(event.data);
        }
      }
      void loadChats();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setProgress("");
    }
  }
  async function decide(id: string, approve: boolean) {
    setLoading(true);
    try {
      await api("/api/approve", {
        method: "POST",
        body: JSON.stringify({ id, approve }),
      });
      setProposals((p) => p.filter((x) => x.id !== id));
      setNotice(approve ? "Approved and saved." : "Proposal rejected.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function analyze(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    try {
      setReport(
        (
          await (
            await api("/api/resume", {
              method: "POST",
              body: new FormData(e.currentTarget),
            })
          ).json()
        ).report,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function download(text: string, name: string) {
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }
  const visible = (data[view] || [])
    .filter((r) => {
      if (
        view === "opportunities" &&
        locationFilter &&
        !String(r.location || "")
          .toLowerCase()
          .includes(locationFilter.toLowerCase())
      )
        return false;
      if (
        view === "opportunities" &&
        minSalary &&
        !(
          r.salary_max >= Number(minSalary) || r.salary_min >= Number(minSalary)
        )
      )
        return false;
      if (view === "actions" && plannerRange !== "all") {
        if (!r.due_on) return false;
        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
        ).getTime();
        const due = new Date(r.due_on + "T12:00:00").getTime();
        if (plannerRange === "overdue")
          return due < today && r.status !== "Done";
        return (
          due >= today &&
          due < today + (plannerRange === "today" ? 1 : 7) * 86400000
        );
      }
      return true;
    })
    .filter(
      (r) =>
        JSON.stringify(r).toLowerCase().includes(query.toLowerCase()) &&
        (!filter || (r.status || r.priority) === filter),
    )
    .sort((a, b) =>
      sort === "name"
        ? String(
            a.name || a.title || a.full_name || a.role_title,
          ).localeCompare(
            String(b.name || b.title || b.full_name || b.role_title),
          )
        : sort === "score"
          ? (score(b, customWeights).score || 0) -
            (score(a, customWeights).score || 0)
          : String(b.created_at).localeCompare(String(a.created_at)),
    );
  function recordTable(rows: Row[], table: string) {
    return rows.length ? (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                {table === "companies"
                  ? "Company"
                  : table === "contacts"
                    ? "Contact"
                    : "Opportunity / activity"}
              </th>
              <th>Details</th>
              <th>Status</th>
              <th>
                {["companies", "opportunities"].includes(table)
                  ? "Match score"
                  : "Next date"}
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="record-name">
                    <span className="avatar">
                      {String(
                        r.name ||
                          r.title ||
                          r.full_name ||
                          r.role_title ||
                          r.summary ||
                          "?",
                      ).slice(0, 1)}
                    </span>
                    <div>
                      <strong>
                        {r.name ||
                          r.title ||
                          r.full_name ||
                          r.role_title ||
                          r.summary}
                      </strong>
                      <small>
                        {table === "companies"
                          ? r.sector
                          : company(r.company_id)}
                      </small>
                    </div>
                  </div>
                </td>
                <td>
                  {r.location || r.job_title || r.kind || "—"}
                  {table === "opportunities" && (
                    <small>
                      {r.salary_min || r.salary_max
                        ? `$${Number(r.salary_min || 0).toLocaleString()} – ${r.salary_max ? "$" + Number(r.salary_max).toLocaleString() : "not stated"}`
                        : "Salary not disclosed"}
                      <br />
                      Authorization: {r.opt_status || "To verify"}
                    </small>
                  )}
                </td>
                <td>
                  <span className="badge">
                    {r.status || r.priority || "Saved"}
                  </span>
                </td>
                <td>
                  {["companies", "opportunities"].includes(table) ? (
                    <>
                      <strong className="score">
                        {score(r, customWeights).score ?? "—"}
                      </strong>
                      <small>
                        {score(r, customWeights).coverage}% evidence coverage ·
                        provisional if incomplete
                      </small>
                    </>
                  ) : (
                    date(r.deadline || r.next_followup || r.due_on)
                  )}
                </td>
                <td>
                  <button
                    className="icon-button"
                    aria-label={
                      "Edit " + (r.name || r.title || r.full_name || "record")
                    }
                    onClick={() => setEditor({ table, row: r })}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <Empty onAdd={() => setEditor({ table })} />
    );
  }
  if (!ready)
    return <div className="loading-screen">Preparing your workspace…</div>;
  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <a className="brand" href="#" onClick={() => navigate("overview")}>
          <span className="brand-icon">
            <Orbit size={25} />
          </span>
          <span>
            Career
            <span className="brand-sub">
              COMMAND CENTER <b>2.0</b>
            </span>
          </span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {nav.map(([id, title, Icon]) => (
            <button
              className={view === id ? "nav-item active" : "nav-item"}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              {title}
              {id === "copilot" && <span className="ai-label">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-target">
          <span className="eyebrow">THE NEXT CHAPTER</span>
          <strong>
            Class of 2027 <ArrowUpRight size={16} />
          </strong>
          <p>Georgia Tech → Your next role</p>
          <div className="target-line" />
          <small>Target start · May–June 2027</small>
        </div>
        <button
          className="profile"
          onClick={() =>
            user ? db.auth.signOut() : setNotice("Enter your email to sign in.")
          }
        >
          <span className="avatar">
            {user?.email?.slice(0, 1).toUpperCase() || "GT"}
          </span>
          <span>
            <strong>{user?.email?.split("@")[0] || "Your workspace"}</strong>
            <small>{user ? "Sign out" : "Sign in to get started"}</small>
          </span>
          {user && <LogOut size={15} />}
        </button>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-toggle icon-button"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle navigation"
          >
            <Menu />
          </button>
          <span>
            Workspace <ChevronRight size={14} />{" "}
            <strong>{nav.find((n) => n[0] === view)?.[1]}</strong>
          </span>
          <div className="topbar-right">
            <span className="status-dot" />
            {user ? "Private workspace" : "Secure workspace"}
            <span className="top-avatar">GT</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CAREER, WITH INTENTION</div>
              <h1>
                {view === "overview"
                  ? "Make your next move count."
                  : nav.find((n) => n[0] === view)?.[1]}
              </h1>
              <p>
                {view === "overview"
                  ? "A clear view of your search. More focus for what comes next."
                  : "One focused workspace for your next chapter."}
              </p>
            </div>
            {user && fields[view] && (
              <button
                className="primary"
                onClick={() => setEditor({ table: view })}
              >
                <Plus size={17} />
                Add{" "}
                {view === "companies"
                  ? "company"
                  : view === "opportunities"
                    ? "opportunity"
                    : "record"}
              </button>
            )}
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!user ? (
            <div className="login-grid">
              <section className="hero-card">
                <span className="badge light">BUILT FOR YOUR NEXT CHAPTER</span>
                <h2>
                  Big ambitions.
                  <br />A focused search.
                </h2>
                <p>
                  Discover opportunities, build meaningful connections, and turn
                  your next move into a plan.
                </p>
                <div className="hero-tags">
                  <span>Aerospace</span>
                  <span>AI & autonomy</span>
                  <span>Systems engineering</span>
                </div>
                <Orbit className="hero-orbit" size={220} />
              </section>
              <section className="panel login">
                <ShieldCheck size={28} />
                <h2>Your private command center</h2>
                <p>
                  Sign in with your existing Supabase account using a secure
                  email link.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const email = String(
                      new FormData(e.currentTarget).get("email"),
                    );
                    const { error } = await db.auth.signInWithOtp({
                      email,
                      options: { emailRedirectTo: window.location.origin },
                    });
                    if (error) setError(error.message);
                    else setNotice("Check your inbox for your sign-in link.");
                  }}
                >
                  <label>
                    Email address
                    <input
                      type="email"
                      name="email"
                      placeholder="you@gatech.edu"
                      required
                    />
                  </label>
                  <button className="primary">
                    Send sign-in link <ArrowUpRight size={17} />
                  </button>
                </form>
                <small>
                  Your existing records stay in your Supabase project.
                </small>
              </section>
            </div>
          ) : (
            <>
              {view === "overview" && (
                <>
                  <div className="kpi-grid">
                    {[
                      ["Tracked companies", companies.length, Building2],
                      [
                        "Saved opportunities",
                        opportunities.length,
                        BriefcaseBusiness,
                      ],
                      [
                        "Active applications",
                        applications.filter(
                          (a) => !["Rejected", "Withdrawn"].includes(a.status),
                        ).length,
                        Columns3,
                      ],
                      ["Upcoming follow-ups", followups.length, CalendarDays],
                    ].map(([title, count, Icon]: any) => (
                      <section className="kpi" key={title}>
                        <div>
                          <span>{title}</span>
                          <Icon size={18} />
                        </div>
                        <strong>{count}</strong>
                        <small>From your saved records</small>
                      </section>
                    ))}
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Application pipeline</h2>
                        <button
                          className="text-button"
                          onClick={() => navigate("applications")}
                        >
                          View board <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="funnel">
                        {[
                          "Planning",
                          "Applied",
                          "Screening",
                          "Interview",
                          "Offer",
                        ].map((s, i) => {
                          const n = applications.filter(
                            (a) => a.status === s,
                          ).length;
                          return (
                            <div key={s}>
                              <div
                                className="funnel-bar"
                                style={{
                                  height:
                                    36 +
                                    (n / Math.max(applications.length, 1)) * 80,
                                  background: [
                                    "#c9dbd4",
                                    "#9fc3b4",
                                    "#78aa96",
                                    "#4c8c74",
                                    "#23664e",
                                  ][i],
                                }}
                              />
                              <strong>{n}</strong>
                              <small>{s}</small>
                            </div>
                          );
                        })}
                      </div>
                      <p className="panel-foot">
                        Current stage distribution · {applications.length}{" "}
                        applications
                      </p>
                    </section>
                    <section className="copilot-card">
                      <div className="copilot-symbol">
                        <Sparkles size={22} />
                      </div>
                      <span className="eyebrow">
                        A LITTLE CLARITY GOES A LONG WAY
                      </span>
                      <h2>
                        Your next move,
                        <br />
                        thought through.
                      </h2>
                      <p>
                        Turn your saved opportunities into a focused plan with
                        your Career Copilot.
                      </p>
                      <button onClick={() => navigate("copilot")}>
                        Plan my next move <ArrowUpRight size={16} />
                      </button>
                    </section>
                    <section className="panel wide">
                      <div className="section-heading">
                        <h2>Recent opportunities</h2>
                        <button
                          className="text-button"
                          onClick={() => navigate("opportunities")}
                        >
                          View all <ArrowUpRight size={15} />
                        </button>
                      </div>
                      {recordTable(opportunities.slice(0, 4), "opportunities")}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Your next actions</h2>
                        <span className="badge">{pending.length} open</span>
                      </div>
                      {pending.length ? (
                        pending.slice(0, 5).map((a) => (
                          <button
                            className="task-row"
                            key={a.id}
                            onClick={() =>
                              setEditor({ table: "actions", row: a })
                            }
                          >
                            <span className="task-check" />
                            <span>
                              <strong>{a.title}</strong>
                              <small>
                                {a.kind || "Action"} · {date(a.due_on)}
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        ))
                      ) : (
                        <Empty
                          text="Room for your next move"
                          detail="Set a small, concrete goal for today."
                          onAdd={() => setEditor({ table: "actions" })}
                        />
                      )}
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Deadlines & follow-ups</h2>
                        <CalendarDays size={18} />
                      </div>
                      {[
                        ...opportunities
                          .filter((r) => r.deadline)
                          .map((r): Row => ({
                            ...r,
                            when: r.deadline,
                            title: r.title,
                            table: "opportunities",
                          })),
                        ...followups.map((r): Row => ({
                          ...r,
                          when: r.next_followup,
                        })),
                      ]
                        .sort((a, b) => a.when.localeCompare(b.when))
                        .slice(0, 5)
                        .map((r) => (
                          <button
                            className="task-row"
                            key={r.id}
                            onClick={() =>
                              setEditor({ table: r.table, row: r })
                            }
                          >
                            <span className="date-tile">{date(r.when)}</span>
                            <strong>{r.title}</strong>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      {!followups.length &&
                        !opportunities.some((r) => r.deadline) && (
                          <Empty
                            text="Nothing on the horizon yet"
                            detail="Add a deadline or follow-up to keep it in view."
                          />
                        )}
                    </section>
                  </div>
                </>
              )}
              {[
                "companies",
                "opportunities",
                "contacts",
                "actions",
                "interactions",
              ].includes(view) && (
                <section className="panel">
                  {view === "opportunities" && (
                    <Matching
                      jobs={opportunities as { id: string; title: string }[]}
                      onSaved={load}
                    />
                  )}
                  {view === "actions" && (
                    <div className="button-row">
                      {["all", "today", "week", "overdue"].map((range) => (
                        <button
                          className={plannerRange === range ? "primary" : ""}
                          key={range}
                          onClick={() => setPlannerRange(range)}
                        >
                          {label(range)}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="toolbar">
                    <div className="search-field">
                      <Search size={17} />
                      <input
                        aria-label="Search records"
                        placeholder="Search your records…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <select
                      aria-label="Filter by status"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="">All statuses</option>
                      {(statuses[view] || []).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Sort records"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Most recent</option>
                      <option value="name">Name A–Z</option>
                      {["companies", "opportunities"].includes(view) && (
                        <option value="score">Highest score</option>
                      )}
                    </select>
                    {view === "contacts" && (
                      <button onClick={() => navigate("interactions")}>
                        Interaction log
                      </button>
                    )}
                  </div>
                  {view === "opportunities" && (
                    <div className="toolbar">
                      <input
                        aria-label="Filter by location"
                        placeholder="Location contains…"
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                      />
                      <input
                        aria-label="Minimum disclosed salary"
                        type="number"
                        min="0"
                        placeholder="Minimum disclosed annual salary"
                        value={minSalary}
                        onChange={(e) => setMinSalary(e.target.value)}
                      />
                    </div>
                  )}
                  {view === "companies" && (
                    <details className="weight-settings">
                      <summary>
                        Customize scoring weights ·{" "}
                        {Object.values(customWeights).reduce(
                          (a, b) => a + b,
                          0,
                        )}{" "}
                        total
                      </summary>
                      <p>
                        Scores normalize over available evidence. Missing values
                        are excluded, never assumed.
                      </p>
                      <div className="form-grid">
                        {Object.entries(customWeights).map(([key, value]) => (
                          <label key={key}>
                            {label(key)}
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={value}
                              onChange={(e) =>
                                updateWeights({
                                  ...customWeights,
                                  [key]: Math.max(
                                    0,
                                    Math.min(100, Number(e.target.value)),
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                  )}
                  {recordTable(visible, view)}
                </section>
              )}
              {view === "applications" && (
                <>
                  <p className="hint">
                    Select a card to review and confirm a stage change. No
                    applications are submitted automatically.
                  </p>
                  <div className="kanban">
                    {stages.map((s) => (
                      <section key={s} className="kanban-column">
                        <h3>
                          <span className="status-dot" />
                          {s}
                          <span>
                            {applications.filter((a) => a.status === s).length}
                          </span>
                        </h3>
                        {applications
                          .filter((a) => a.status === s)
                          .map((a) => (
                            <button
                              key={a.id}
                              className="kanban-card"
                              onClick={() =>
                                setEditor({ table: "applications", row: a })
                              }
                            >
                              <strong>{a.role_title || "Untitled role"}</strong>
                              <small>{company(a.company_id)}</small>
                              <span className="badge">
                                {date(a.next_followup)}
                              </span>
                            </button>
                          ))}
                        <button
                          className="kanban-add"
                          onClick={() =>
                            setEditor({
                              table: "applications",
                              row: { status: s },
                            })
                          }
                        >
                          <Plus size={15} />
                          Add application
                        </button>
                      </section>
                    ))}
                  </div>
                </>
              )}
              {view === "analytics" && (
                <section className="panel">
                  <h2>Your search, in perspective</h2>
                  <div className="metric-list">
                    {stages.map((s) => (
                      <div key={s}>
                        <span>{s}</span>
                        <div className="metric-track">
                          <i
                            style={{
                              width: `${applications.length ? (applications.filter((a) => a.status === s).length / applications.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <strong>
                          {applications.filter((a) => a.status === s).length}
                        </strong>
                      </div>
                    ))}
                  </div>
                  <p>
                    {actions.filter((a) => a.status === "Done").length}{" "}
                    completed actions · {data.contacts?.length || 0} contacts ·{" "}
                    {
                      opportunities.filter(
                        (o) => o.salary_min == null && o.salary_max == null,
                      ).length
                    }{" "}
                    opportunities with undisclosed salary
                  </p>
                  <button
                    onClick={() =>
                      download(
                        "# Career progress\n\n" +
                          stages
                            .map(
                              (s) =>
                                `${s}: ${applications.filter((a) => a.status === s).length}`,
                            )
                            .join("\n") +
                          "\n\nGenerated " +
                          new Date().toISOString(),
                        "career-progress.md",
                      )
                    }
                  >
                    <Download size={16} />
                    Download progress report
                  </button>
                </section>
              )}
              {view === "copilot" && (
                <div className="chat-layout">
                  <section className="panel conversation-list">
                    <button
                      onClick={() => {
                        setConversationId(undefined);
                        setChat([]);
                      }}
                    >
                      <Plus size={16} />
                      New conversation
                    </button>
                    {conversations.map((c) => (
                      <button
                        className={conversationId === c.id ? "selected" : ""}
                        key={c.id}
                        onClick={() => {
                          setConversationId(c.id);
                          void loadChats(c.id);
                        }}
                      >
                        {c.title}
                      </button>
                    ))}
                  </section>
                  <section className="panel chat-panel">
                    <div className="section-heading">
                      <h2>
                        <Sparkles size={19} />
                        Career Copilot
                      </h2>
                      <span className="badge">
                        Approval required for changes
                      </span>
                    </div>
                    <div className="messages" aria-live="polite">
                      {!chat.length && (
                        <Empty
                          text="What’s your next move?"
                          detail="Ask for a weekly plan, recruiter outreach draft, application summary, or interview preparation."
                        />
                      )}
                      {chat.map((m, i) => (
                        <div className={"message " + m.role} key={m.id || i}>
                          <strong>
                            {m.role === "user" ? "You" : "Career Copilot"}
                          </strong>
                          <p>{m.content}</p>
                        </div>
                      ))}
                      {progress && (
                        <p className="progress">
                          <span className="status-dot" />
                          {progress}…
                        </p>
                      )}
                    </div>
                    {proposals.map((p) => (
                      <div className="proposal" key={p.id}>
                        <strong>Review proposed change</strong>
                        <p>
                          {p.kind === "create_action"
                            ? "Create action"
                            : p.kind === "mutate_record"
                              ? "Record change"
                              : "Update opportunity"}
                          : {p.payload.title}
                        </p>
                        <pre>{JSON.stringify(p.payload, null, 2)}</pre>
                        <div className="button-row">
                          <button
                            className="primary"
                            disabled={loading}
                            onClick={() => decide(p.id, true)}
                          >
                            <Check size={16} />
                            Approve & save
                          </button>
                          <button
                            disabled={loading}
                            onClick={() => decide(p.id, false)}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                    <form className="chat-input" onSubmit={send}>
                      <input
                        name="message"
                        aria-label="Message to Career Copilot"
                        maxLength={6000}
                        placeholder="Ask your career copilot…"
                        required
                        disabled={loading}
                      />
                      <button
                        className="primary"
                        disabled={loading}
                        aria-label="Send message"
                      >
                        <Send size={18} />
                      </button>
                    </form>
                    <small>
                      Drafts stay here. Messages and applications are never sent
                      externally.
                    </small>
                  </section>
                </div>
              )}
              {view === "resume" && (
                <div className="resume-grid">
                  <section className="panel">
                    <span className="eyebrow">MAKE YOUR EXPERIENCE COUNT</span>
                    <h2>Connect your experience to the role.</h2>
                    <p>
                      Get an evidence-based assessment, skill gaps, resume
                      improvements, and interview questions.
                    </p>
                    <form onSubmit={analyze}>
                      <label>
                        Resume · PDF, up to 5 MB
                        <input
                          type="file"
                          name="resume"
                          accept="application/pdf"
                          required
                        />
                      </label>
                      <label>
                        Job description · optional PDF
                        <input
                          type="file"
                          name="jobPdf"
                          accept="application/pdf"
                        />
                      </label>
                      <label>
                        Or paste the job description
                        <textarea
                          name="description"
                          minLength={30}
                          maxLength={20000}
                          rows={10}
                          placeholder="Paste the full job description…"
                        />
                      </label>
                      <p className="hint">
                        Submitted documents are sent to OpenAI for analysis.
                        This app does not retain the PDF. Avoid unnecessary
                        sensitive information.
                      </p>
                      <button className="primary" disabled={loading}>
                        <Sparkles size={16} />
                        {loading ? "Analyzing…" : "Analyze compatibility"}
                      </button>
                    </form>
                  </section>
                  <section className="panel">
                    {report ? (
                      <>
                        <div className="section-heading">
                          <h2>Your analysis</h2>
                          <button
                            onClick={() =>
                              download(report, "resume-analysis.md")
                            }
                          >
                            <Download size={16} />
                            Download
                          </button>
                        </div>
                        <div className="report">{report}</div>
                      </>
                    ) : (
                      <Empty
                        text="A stronger story starts here"
                        detail="Your personalized report will appear after analysis."
                      />
                    )}
                  </section>
                </div>
              )}
              {view === "discovery" && (
                <>
                  <div className="panel">
                    <h2>Monitor authorized company job boards</h2>
                    <p>
                      Only public ATS APIs. Verify permission before enabling a
                      source. Scans require the deployed worker secrets.
                    </p>
                    <form
                      className="source-form"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        try {
                          await api("/api/discovery", {
                            method: "POST",
                            body: JSON.stringify({
                              provider: fd.get("provider"),
                              board: fd.get("board"),
                              frequency_hours: Number(fd.get("frequency")),
                              families: String(fd.get("families") || "")
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                              authorized: fd.get("authorized") === "on",
                            }),
                          });
                          await loadDiscovery();
                          setNotice(
                            "Source saved. The scheduled worker will scan when due.",
                          );
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      <label>
                        ATS
                        <select name="provider">
                          <option value="greenhouse">Greenhouse</option>
                          <option value="lever">Lever</option>
                          <option value="ashby">Ashby</option>
                        </select>
                      </label>
                      <label>
                        Board identifier
                        <input
                          name="board"
                          placeholder="Company board slug"
                          required
                          pattern="[a-zA-Z0-9_-]{1,100}"
                        />
                      </label>
                      <label>
                        Frequency
                        <select name="frequency">
                          <option value="24">Daily</option>
                          <option value="6">Every 6 hours</option>
                          <option value="168">Weekly</option>
                        </select>
                      </label>
                      <label>
                        Job families
                        <input
                          name="families"
                          placeholder="Systems, autonomy, ML"
                        />
                      </label>
                      <label className="checkbox-label">
                        <input type="checkbox" name="authorized" required />I
                        verified that this public feed permits access.
                      </label>
                      <button className="primary">Confirm & monitor</button>
                    </form>
                    {sources.map((s) => (
                      <div className="source-row" key={s.id}>
                        <strong>{s.board}</strong>
                        <button
                          onClick={async () => {
                            try {
                              await api("/api/discovery", {
                                method: "PATCH",
                                body: JSON.stringify({
                                  id: s.id,
                                  enabled: !s.enabled,
                                  confirmed: true,
                                }),
                              });
                              await loadDiscovery();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          {s.enabled ? "Pause monitoring" : "Resume monitoring"}
                        </button>
                        <span>
                          {s.provider} · every {s.frequency_hours}h
                        </span>
                        <small>
                          {s.last_error ||
                            (s.last_scan
                              ? "Verified " +
                                new Date(s.last_scan).toLocaleString()
                              : "Awaiting first scan")}
                        </small>
                      </div>
                    ))}
                  </div>
                  <section className="panel">
                    <h2>Discovered roles</h2>
                    <p>
                      Source presence is verified at the scan timestamp. Work
                      authorization remains unverified.
                    </p>
                    {jobs
                      .filter((j) => {
                        const source = sources.find(
                          (s) => s.id === j.source_id,
                        );
                        return (
                          !source?.families?.length ||
                          source.families.some((f: string) =>
                            j.title.toLowerCase().includes(f.toLowerCase()),
                          )
                        );
                      })
                      .map((j) => (
                        <article className="discovered" key={j.id}>
                          <div>
                            <a
                              href={j.source_url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <strong>{j.title}</strong>
                              <ArrowUpRight size={15} />
                            </a>
                            <small>
                              {j.location} ·{" "}
                              {j.closed_at
                                ? "No longer listed"
                                : "Listed at last scan"}{" "}
                              · Verified{" "}
                              {new Date(j.verified_at).toLocaleString()}
                            </small>
                            <details>
                              <summary>
                                Source evidence & work authorization
                              </summary>
                              {j.compensation && (
                                <>
                                  <p>
                                    Disclosed compensation (source format;
                                    verify currency and period)
                                  </p>
                                  <pre>
                                    {JSON.stringify(j.compensation, null, 2)}
                                  </pre>
                                </>
                              )}
                              {j.published_at && (
                                <p>
                                  Published{" "}
                                  {new Date(j.published_at).toLocaleString()}
                                </p>
                              )}
                              <pre>
                                {JSON.stringify(
                                  authorizationEvidence(j.description || ""),
                                  null,
                                  2,
                                )}
                              </pre>
                            </details>
                          </div>
                          <button
                            onClick={() =>
                              setEditor({
                                table: "opportunities",
                                row: {
                                  title: j.title,
                                  location: j.location,
                                  job_url: j.source_url,
                                  notes: j.description?.slice(0, 8000),
                                },
                              })
                            }
                          >
                            Save opportunity
                          </button>
                        </article>
                      ))}
                    {!jobs.length && (
                      <Empty
                        text="A deliberate discovery process"
                        detail="Add an authorized source to start monitoring. No vacancies are preloaded."
                      />
                    )}
                  </section>
                </>
              )}
            </>
          )}
          <footer>
            <span>
              <ShieldCheck size={13} />
              Private by design
            </span>
            <span>May–June 2027 · San Francisco / New York / Miami</span>
          </footer>
        </main>
      </div>
      {editor && (
        <div className="modal-backdrop">
          <section
            className="editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
          >
            <div className="section-heading">
              <h2 id="editor-title">
                {editor.row?.id ? "Edit" : "Add"} {label(editor.table)}
              </h2>
              <button
                className="icon-button"
                aria-label="Close editor"
                onClick={() => setEditor(null)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="form-grid">
                {fields[editor.table].map((k) => {
                  const value = editor.row?.[k] ?? "";
                  const parent = (
                    {
                      company_id: "companies",
                      opportunity_id: "opportunities",
                      contact_id: "contacts",
                    } as Row
                  )[k];
                  const options =
                    k === "priority"
                      ? editor.table === "companies"
                        ? ["Watchlist", "High", "Medium", "Low"]
                        : ["Medium", "High", "Low"]
                      : k === "status"
                        ? statuses[editor.table]
                        : null;
                  return (
                    <label key={k}>
                      {label(k)}
                      {parent ? (
                        <select name={k} defaultValue={value}>
                          <option value="">None</option>
                          {(data[parent] || []).map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name || r.title || r.full_name}
                            </option>
                          ))}
                        </select>
                      ) : options ? (
                        <select name={k} defaultValue={value || options[0]}>
                          {options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : k === "notes" || k === "summary" ? (
                        <textarea
                          name={k}
                          defaultValue={value}
                          maxLength={8000}
                          rows={4}
                        />
                      ) : (
                        <input
                          name={k}
                          defaultValue={value}
                          required={[
                            "name",
                            "title",
                            "role_title",
                            "full_name",
                          ].includes(k)}
                          type={
                            k.endsWith("_score") || k.startsWith("salary_")
                              ? "number"
                              : k.endsWith("_on") ||
                                  k === "deadline" ||
                                  k === "next_followup"
                                ? "date"
                                : k.includes("url") || k === "website"
                                  ? "url"
                                  : k === "email"
                                    ? "email"
                                    : "text"
                          }
                          min={k.endsWith("_score") ? 1 : 0}
                          max={k.endsWith("_score") ? 5 : undefined}
                        />
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="hint">
                Review the values above. Saving confirms this database change.
              </p>
              <div className="button-row">
                <button type="button" onClick={() => setEditor(null)}>
                  Cancel
                </button>
                <button className="primary" disabled={loading}>
                  {loading ? "Saving…" : "Confirm & save"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
