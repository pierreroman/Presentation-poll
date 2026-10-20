import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  Lock,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { newId, type PollQuestion, type PollStatus } from "./poll-data";
import { usePollSession } from "@/lib/use-poll-session";
import type { PollSession } from "@/lib/poll-types";

const STATUS_TONE: Record<PollStatus, { label: string; dot: string; badge: string }> = {
  ready: {
    label: "Not started",
    dot: "status-dot-ready",
    badge: "status-badge",
  },
  open: {
    label: "Voting open",
    dot: "status-dot-open",
    badge: "status-badge",
  },
  closed: {
    label: "Closed",
    dot: "status-dot-closed",
    badge: "status-badge",
  },
};

const LETTERS = "ABCDEF";
const MAX_OPTIONS = 6;
const MIN_OPTIONS = 2;

function StatusBadge({ status }: { status: PollStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        tone.badge,
      )}
    >
      <span className={cn("size-2 rounded-full forced-colors:bg-[CanvasText]", tone.dot)} aria-hidden="true" />
      {tone.label}
    </span>
  );
}

const totalVotes = (q: PollQuestion) => q.options.reduce((s, o) => s + o.votes, 0);

type Mode = "vote" | "present" | "edit" | "results";

const MODE_PATHS: Record<Mode, string> = {
  vote: "/",
  present: "/presenter",
  edit: "/questions",
  results: "/results",
};

const MODE_LABELS: Record<Mode, string> = {
  vote: "Vote",
  present: "Presenter",
  edit: "Questions",
  results: "Results",
};

export function HomePage() {
  const poll = usePollSession();
  if (!poll.session) {
    return (
      <section id="poll-work" className="poll-container" aria-live="polite">
        {poll.error ? (
          <div role="alert" className="question-card">
            <p>{poll.error}</p>
            <Button className="mt-3" onClick={() => void poll.refresh()}>Retry connection</Button>
            <a className="mt-3 underline" href="/.auth/login/aad?post_login_redirect_uri=/presenter">Presenter sign-in</a>
          </div>
        ) : <p>Connecting to the live session...</p>}
      </section>
    );
  }
  return <PollPage poll={poll} session={poll.session} />;
}

const modeFromPath = (path: string): Mode =>
  path.startsWith("/questions") ? "edit"
    : path.startsWith("/presenter") ? "present"
      : path.startsWith("/results") ? "results" : "vote";

function PollPage({ poll, session }: { poll: ReturnType<typeof usePollSession>; session: PollSession }) {
  const { canPresent, pending, error, principal } = poll;
  const [path, setPath] = useState(() => window.location.pathname);
  const mode = canPresent ? modeFromPath(path) : "vote";
  const [draftTitle, setDraftTitle] = useState(session.title);
  const [draftQuestions, setQuestions] = useState(session.questions);
  const [editRevision, setEditRevision] = useState(session.configRevision);
  const [currentId, setCurrentId] = useState(session.questions[0]?.id ?? "");
  const questions = mode === "edit" ? draftQuestions : session.questions;
  const title = mode === "edit" ? draftTitle : session.title;
  const showResults = session.showResults;

  const setMode = (next: Mode) => {
    if (next !== "vote" && !canPresent) return;
    if (next === "edit" && mode !== "edit") {
      setDraftTitle(session.title);
      setQuestions(session.questions);
      setEditRevision(session.configRevision);
    }
    setPath(MODE_PATHS[next]);
    window.history.pushState(null, "", MODE_PATHS[next]);
  };
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const index = Math.max(0, questions.findIndex((q) => q.id === currentId));
  const current = questions[index];

  const setStatus = (status: PollStatus) => {
    if (!current) return;
    void poll.command({ type: "status", questionId: current.id, status });
  };

  const vote = (optionId: string, questionId = current?.id) => {
    if (questionId) void poll.vote(questionId, optionId);
  };

  const undoVote = () => {
    if (!current) return;
    void poll.command({ type: "undo", questionId: current.id });
  };

  const resetVotes = async () => {
    if (!current) return;
    if (await poll.command({ type: "reset", questionId: current.id })) {
      toast.success("Votes cleared for this question");
    }
  };

  const go = (delta: number) => {
    const next = questions[index + delta];
    if (next) setCurrentId(next.id);
  };

  const canUndo = current ? session.undoQuestionIds.includes(current.id) : false;
  const saveQuestions = async () => {
    if (await poll.command({
      type: "edit", title: draftTitle, questions: draftQuestions, configRevision: editRevision,
    })) {
      toast.success("Questions saved");
      setMode("present");
    }
  };

  return (
    <div className="poll-container">
      {error && <div role="alert" className="question-card"><p>{error}</p><Button onClick={() => void poll.refresh()}>Retry connection</Button></div>}
      <fieldset disabled={pending || !!error} className="contents">
      <div className="view-toolbar flex flex-wrap items-end justify-between gap-3">
        {mode !== "vote" && (
        <div className="min-w-0 flex-1">
          <Label htmlFor="session-title" className="text-xs font-medium text-foreground">
            Session
          </Label>
          <Input
            id="session-title"
            value={title}
            onChange={(e) => setDraftTitle(e.target.value)}
            readOnly={mode !== "edit"}
            maxLength={200}
            className="mt-1 h-10 max-w-xl border-transparent px-0 text-xl font-semibold shadow-none hover:border-border focus-visible:px-2"
          />
        </div>
        )}
        {canPresent ? <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{principal?.userDetails}</span>
        <div role="group" aria-label="View" className="inline-flex rounded-md border border-border p-0.5">
          {(["vote", "present", "edit", "results"] as Mode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "default" : "ghost"}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
            </Button>
          ))}
        </div>
        <a className="text-xs underline" href="/.auth/logout?post_logout_redirect_uri=/">Sign out</a>
        </div> : principal ? (
          <div className="text-xs text-muted-foreground">
            Signed in without presenter access. <a className="underline" href="/.auth/logout?post_logout_redirect_uri=/">Sign out</a>
          </div>
        ) : <a className="text-xs text-muted-foreground underline" href="/.auth/login/aad?post_login_redirect_uri=/presenter">Presenter sign-in</a>}
      </div>

      {mode === "vote" ? (
        <section id="poll-work" tabIndex={-1} aria-labelledby="overview-heading" className="overview outline-none">
          <div className="overview-intro">
            <p className="eyebrow">Separating fact from fiction</p>
            <h1 id="overview-heading">Sovereign cloud<br /><span>Debunkers</span></h1>
            <p className="overview-description">
              Put {questions.length === 6 ? "six" : questions.length} common assumptions to the test.
              Choose Busted, Plausible or Confirmed for each statement.
            </p>
            <p className="overview-note">
              Vote when the presenter opens a statement. Each click adds one shared vote.
              Results reflect audience opinion, not a factual verdict. Updates refresh automatically.
            </p>
          </div>
          <div className="overview-progress-heading">
            <span className="status-badge">
              <span className={questions.some((q) => q.status === "open") ? "status-dot-open" : "status-dot-ready"} />
              {questions.some((q) => q.status === "open") ? "Voting is open" : "Waiting for presenter"}
            </span>
            <span aria-live="polite">
              {showResults ? `${questions.filter((q) => totalVotes(q) > 0).length} of ${questions.length} with votes` : "Results hidden"}
            </span>
          </div>
          <progress className="overview-progress" aria-label="Questions with votes"
            value={showResults ? questions.filter((q) => totalVotes(q) > 0).length : 0} max={Math.max(1, questions.length)} />
          {questions.length === 0 && (
            <div className="question-card">
              <p>No questions yet.</p>
              {canPresent && <Button onClick={() => setMode("edit")}>Add questions</Button>}
            </div>
          )}
          <div className="question-grid">
            {questions.map((q, i) => (
              <article key={q.id} className="question-card" aria-labelledby={`overview-${q.id}`}>
                <div className="question-card-meta">
                  <span className="eyebrow">Statement {i + 1}</span>
                  <StatusBadge status={q.status} />
                </div>
                <h2 id={`overview-${q.id}`}>{q.prompt}</h2>
                <div className="question-card-options" style={{ gridTemplateColumns: `repeat(${Math.min(3, q.options.length)}, minmax(0, 1fr))` }}>
                  {q.options.map((o) => (
                    <button key={o.id} type="button" disabled={q.status !== "open"}
                      onClick={() => vote(o.id, q.id)}
                      aria-label={`${q.prompt} ${o.label}. Add a vote.`}
                      className={cn("verdict-button", showResults && o.votes > 0 && "has-votes")}>
                      {o.label}
                    </button>
                  ))}
                </div>
                {canPresent && <button type="button" className="present-question" onClick={() => { setCurrentId(q.id); setMode("present"); }}>
                  Present statement {i + 1} <ArrowRight className="size-3" aria-hidden="true" />
                </button>}
              </article>
            ))}
          </div>
        </section>
      ) : mode === "present" ? (
        <div className="grid flex-1 gap-4 lg:grid-cols-[300px_1fr]">
          <RunOfShow questions={questions} currentId={current?.id} onSelect={setCurrentId} />
          {current ? (
            <section
              id="poll-work"
              tabIndex={-1}
              aria-labelledby="current-question"
              className="flex flex-col rounded-lg border border-border bg-card p-6 outline-none"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  Question {index + 1} of {questions.length}
                </span>
                <StatusBadge status={current.status} />
              </div>
              <h1 id="current-question" className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
                {current.prompt}
              </h1>

              <ResultsBoard question={current} showResults={showResults} onVote={(id) => vote(id)} />

              <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {current.status === "open" ? (
                  <Button onClick={() => setStatus("closed")}>
                    <Lock aria-hidden="true" /> Close voting
                  </Button>
                ) : (
                  <Button onClick={() => setStatus("open")}>
                    <Play aria-hidden="true" /> {current.status === "closed" ? "Reopen voting" : "Open voting"}
                  </Button>
                )}
                <Button variant="outline" aria-pressed={showResults} onClick={() => void poll.command({ type: "results", showResults: !showResults })}>
                  {showResults ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                  {showResults ? "Hide results" : "Show results"}
                </Button>
                <Button variant="outline" onClick={undoVote} disabled={!canUndo}>
                  <Undo2 aria-hidden="true" /> Undo last vote
                </Button>
                <Button variant="ghost" onClick={resetVotes} disabled={totalVotes(current) === 0 && current.status === "ready"}>
                  <RotateCcw aria-hidden="true" /> Reset
                </Button>
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" onClick={() => go(-1)} disabled={index === 0}>
                    <ArrowLeft aria-hidden="true" /> Previous
                  </Button>
                  <Button variant="outline" onClick={() => go(1)} disabled={index >= questions.length - 1}>
                    Next <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </section>
          ) : (
            <section id="poll-work" tabIndex={-1} className="rounded-lg border border-border bg-card p-6">
              <p className="text-foreground">No questions yet.</p>
              <Button className="mt-3" onClick={() => setMode("edit")}>
                <Plus aria-hidden="true" /> Add questions
              </Button>
            </section>
          )}
        </div>
      ) : mode === "results" ? (
        <SessionResults questions={questions} path={path} />
      ) : (
        <QuestionEditor
          questions={questions}
          setQuestions={setQuestions}
          onDone={() => void saveQuestions()}
        />
      )}
      </fieldset>
    </div>
  );
}

function SessionResults({ questions, path }: { questions: PollQuestion[]; path: string }) {
  if (path === "/results" || path === "/results/") {
    return (
      <section id="poll-work" tabIndex={-1} aria-labelledby="results-heading" className="space-y-6 outline-none">
        <header>
          <p className="eyebrow">Presenter only</p>
          <h1 id="results-heading" className="mt-2 text-3xl font-semibold">Question results</h1>
          <p className="mt-2 text-sm text-muted-foreground">Choose a question to open its own live results page.</p>
        </header>
        {questions.length === 0 && <p>No questions yet. Add statements in Questions to see their results here.</p>}
        <ol className="space-y-3">
          {questions.map((question, index) => (
            <li key={question.id}>
              <a href={`/results-${index + 1}`} className="block rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-ring">
                <div className="flex items-center justify-between gap-3">
                  <span className="eyebrow">Question {index + 1}</span>
                  <StatusBadge status={question.status} />
                </div>
                <p className="mt-3 font-semibold">{question.prompt}</p>
                <span className="mt-2 inline-block text-sm text-primary">View results <span aria-hidden="true">&rarr;</span></span>
              </a>
            </li>
          ))}
        </ol>
      </section>
    );
  }

  const match = /^\/results-([1-9]\d*)\/?$/.exec(path);
  const number = match ? Number(match[1]) : 0;
  const question = Number.isSafeInteger(number) ? questions[number - 1] : undefined;
  if (!question) {
    return (
      <section id="poll-work" tabIndex={-1} aria-labelledby="results-heading" className="space-y-4 outline-none">
        <h1 id="results-heading" className="text-3xl font-semibold">Question not found</h1>
        <p>This results link does not match a question in the current session.</p>
        <a className="text-primary underline" href="/results">View all question links</a>
      </section>
    );
  }

  const count = totalVotes(question);
  return (
    <section id="poll-work" tabIndex={-1} aria-labelledby="results-heading" className="space-y-6 outline-none">
      <header>
        <p className="eyebrow">Presenter only</p>
        <h1 id="results-heading" className="mt-2 text-3xl font-semibold">Results for question {number}</h1>
        <p className="mt-2 text-sm text-muted-foreground" aria-live="polite">
          Question {number} of {questions.length} | {count} total {count === 1 ? "vote" : "votes"}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Refreshes automatically every three seconds. Counts remain visible here when results are hidden from attendees.
        </p>
      </header>
      <nav aria-label="Question results" className="flex flex-wrap items-center gap-4 text-sm">
        <a className="text-primary underline" href="/results">All question links</a>
        {number > 1 && <a className="text-primary underline" href={`/results-${number - 1}`}>Previous question</a>}
        {number < questions.length && <a className="text-primary underline" href={`/results-${number + 1}`}>Next question</a>}
      </nav>
            <article aria-labelledby="question-result-heading" className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">Question {number}</span>
                <StatusBadge status={question.status} />
              </div>
              <h2 id="question-result-heading" className="mt-3 text-xl font-semibold">{question.prompt}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Total: {count} {count === 1 ? "vote" : "votes"}{count === 0 ? " — No votes yet." : ""}
              </p>
              <dl className="mt-5 space-y-4">
                {question.options.map((option) => {
                  const percent = count ? Math.round(option.votes / count * 100) : 0;
                  return (
                    <div key={option.id}>
                      <div className="flex items-baseline justify-between gap-4">
                        <dt className="min-w-0 break-words text-sm font-medium">{option.label}</dt>
                        <dd className="shrink-0 text-sm tabular-nums">
                          {option.votes} {option.votes === 1 ? "vote" : "votes"} ({percent}%)
                        </dd>
                      </div>
                      <progress className="overview-progress !my-2 !h-2 rounded-full"
                        aria-label={`Question ${number}: ${option.label}`}
                        value={option.votes} max={Math.max(1, count)} />
                    </div>
                  );
                })}
              </dl>
            </article>
    </section>
  );
}

function RunOfShow({
  questions,
  currentId,
  onSelect,
}: {
  questions: PollQuestion[];
  currentId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Questions in this session" className="rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Run of show</h2>
      <ol className="relative p-2">
        {questions.map((q, i) => {
          const active = q.id === currentId;
          const total = totalVotes(q);
          return (
            <li key={q.id} className="relative">
              {i < questions.length - 1 && (
                <span aria-hidden="true" className="absolute left-[23px] top-9 h-[calc(100%-20px)] w-px bg-border" />
              )}
              <button
                type="button"
                onClick={() => onSelect(q.id)}
                aria-current={active ? "step" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active && "bg-muted",
                )}
              >
                <span
                  className={cn(
                    "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("line-clamp-2 text-sm", active ? "font-semibold" : "font-medium")}>
                    {q.prompt}
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <StatusBadge status={q.status} />
                    <span className="text-xs text-foreground">
                      {total} {total === 1 ? "vote" : "votes"}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ResultsBoard({
  question,
  showResults,
  onVote,
}: {
  question: PollQuestion;
  showResults: boolean;
  onVote: (optionId: string) => void;
}) {
  const total = totalVotes(question);
  const max = Math.max(0, ...question.options.map((o) => o.votes));
  const open = question.status === "open";
  const summary = useMemo(() => {
    if (total === 0) return "No votes yet.";
    const leaders = question.options.filter((o) => o.votes === max);
    const names = leaders.map((o) => o.label).join(" and ");
    return `${total} ${total === 1 ? "vote" : "votes"}. ${leaders.length > 1 ? "Tied" : "Leading"}: ${names} (${Math.round((max / total) * 100)}%).`;
  }, [question, total, max]);

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Results</h2>
        <span className="text-sm text-foreground" aria-live="polite">
          {showResults ? summary : `${total} ${total === 1 ? "vote" : "votes"} · results hidden`}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {question.options.map((o, i) => {
          const pct = total ? Math.round((o.votes / total) * 100) : 0;
          const leading = showResults && total > 0 && o.votes === max;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!open}
                onClick={() => onVote(o.id)}
                aria-label={`${LETTERS[i]}: ${o.label}${showResults ? `, ${o.votes} votes, ${pct}%` : ""}${open ? ". Add a vote" : ""}`}
                className={cn(
                  "group relative flex min-h-16 w-full items-center gap-4 overflow-hidden rounded-lg border bg-background px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  open ? "cursor-pointer border-border hover:border-primary" : "cursor-default border-border",
                  leading && "border-primary",
                )}
              >
                {showResults && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-500 ease-out forced-colors:bg-[Highlight]"
                    style={{ width: `${pct}%` }}
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-9 shrink-0 items-center justify-center rounded-md text-base font-semibold",
                    leading ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                  aria-hidden="true"
                >
                  {LETTERS[i]}
                </span>
                <span className="relative flex-1 text-lg font-medium">{o.label}</span>
                {showResults && (
                  <span className="relative text-right tabular-nums" aria-hidden="true">
                    <span className="block text-2xl font-semibold">{pct}%</span>
                    <span className="block text-xs text-foreground">
                      {o.votes} {o.votes === 1 ? "vote" : "votes"}
                    </span>
                  </span>
                )}
                {open && (
                  <span className="relative hidden text-sm font-medium text-foreground group-hover:inline" aria-hidden="true">
                    +1
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function QuestionEditor({
  questions,
  setQuestions,
  onDone,
}: {
  questions: PollQuestion[];
  setQuestions: React.Dispatch<React.SetStateAction<PollQuestion[]>>;
  onDone: (focusId?: string) => void;
}) {
  const patch = (id: string, fn: (q: PollQuestion) => PollQuestion) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? fn(q) : q)));

  const move = (i: number, d: number) =>
    setQuestions((qs) => {
      const j = i + d;
      if (j < 0 || j >= qs.length) return qs;
      const next = [...qs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addQuestion = () => {
    const id = newId("q");
    setQuestions((qs) => [
      ...qs,
      {
        id,
        prompt: "",
        status: "ready",
        options: [
          { id: newId("o"), label: "", votes: 0 },
          { id: newId("o"), label: "", votes: 0 },
        ],
      },
    ]);
  };

  const remove = (q: PollQuestion, i: number) => {
    setQuestions((qs) => qs.filter((x) => x.id !== q.id));
    toast(`Question ${i + 1} removed`, {
      action: {
        label: "Undo",
        onClick: () =>
          setQuestions((qs) => {
            const next = [...qs];
            next.splice(i, 0, q);
            return next;
          }),
      },
    });
  };

  return (
    <section id="poll-work" tabIndex={-1} aria-labelledby="editor-heading" className="flex flex-col gap-4 outline-none">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id="editor-heading" className="text-lg font-semibold">
          Questions <span className="font-normal text-foreground">({questions.length})</span>
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addQuestion} disabled={questions.length >= 20}>
            <Plus aria-hidden="true" /> Add question
          </Button>
          <Button onClick={() => onDone()}>
            <Play aria-hidden="true" /> Save and present
          </Button>
        </div>
      </div>

      <ol className="flex flex-col gap-3">
        {questions.map((q, i) => {
          const hasVotes = totalVotes(q) > 0;
          return (
            <li key={q.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <Label htmlFor={`prompt-${q.id}`}>Question</Label>
                    <Textarea
                      id={`prompt-${q.id}`}
                      value={q.prompt}
                      rows={2}
                      maxLength={500}
                      placeholder="Type the question to ask the audience"
                      onChange={(e) => patch(q.id, (x) => ({ ...x, prompt: e.target.value }))}
                      className="mt-1 text-base"
                    />
                  </div>
                  <fieldset>
                    <legend className="text-sm font-medium">Answer options</legend>
                    <div className="mt-1 grid gap-2 sm:grid-cols-2">
                      {q.options.map((o, oi) => (
                        <div key={o.id} className="flex items-center gap-2">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-semibold" aria-hidden="true">
                            {LETTERS[oi]}
                          </span>
                          <Input
                            aria-label={`Option ${LETTERS[oi]}`}
                            value={o.label}
                            maxLength={120}
                            placeholder={`Option ${LETTERS[oi]}`}
                            onChange={(e) =>
                              patch(q.id, (x) => ({
                                ...x,
                                options: x.options.map((y) => (y.id === o.id ? { ...y, label: e.target.value } : y)),
                              }))
                            }
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove option ${LETTERS[oi]}`}
                            disabled={q.options.length <= MIN_OPTIONS}
                            onClick={() =>
                              patch(q.id, (x) => ({ ...x, options: x.options.filter((y) => y.id !== o.id) }))
                            }
                          >
                            <X aria-hidden="true" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2"
                      disabled={q.options.length >= MAX_OPTIONS}
                      onClick={() =>
                        patch(q.id, (x) => ({ ...x, options: [...x.options, { id: newId("o"), label: "", votes: 0 }] }))
                      }
                    >
                      <Plus aria-hidden="true" /> Add option
                    </Button>
                  </fieldset>
                  {hasVotes && (
                    <p className="text-xs text-foreground">
                      {totalVotes(q)} votes recorded. Editing an option keeps its votes.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Move question ${i + 1} down`}
                    disabled={i === questions.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete question ${i + 1}`} onClick={() => remove(q, i)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
