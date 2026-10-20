import { useMemo, useState } from "react";
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
import {
  SAMPLE_QUESTIONS,
  SESSION_TITLE,
  newId,
  type PollQuestion,
  type PollStatus,
} from "./poll-data";

const STATUS_TONE: Record<PollStatus, { label: string; dot: string; badge: string }> = {
  ready: {
    label: "Not started",
    dot: "bg-gray-500",
    badge: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100",
  },
  open: {
    label: "Voting open",
    dot: "bg-green-600",
    badge: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-50",
  },
  closed: {
    label: "Closed",
    dot: "bg-blue-600",
    badge: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-50",
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

type Mode = "present" | "edit";

export function HomePage() {
  const [title, setTitle] = useState(SESSION_TITLE);
  const [questions, setQuestions] = useState<PollQuestion[]>(SAMPLE_QUESTIONS);
  const [currentId, setCurrentId] = useState<string>(SAMPLE_QUESTIONS[0].id);
  const [mode, setMode] = useState<Mode>("present");
  const [showResults, setShowResults] = useState(true);
  const [voteLog, setVoteLog] = useState<{ q: string; o: string }[]>([]);

  const index = Math.max(0, questions.findIndex((q) => q.id === currentId));
  const current = questions[index];

  const update = (id: string, fn: (q: PollQuestion) => PollQuestion) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? fn(q) : q)));

  const setStatus = (status: PollStatus) => {
    if (!current) return;
    setQuestions((qs) =>
      qs.map((q) => {
        if (q.id === current.id) return { ...q, status };
        // Only one question collects votes at a time.
        if (status === "open" && q.status === "open") return { ...q, status: "closed" };
        return q;
      }),
    );
  };

  const vote = (optionId: string) => {
    if (!current || current.status !== "open") return;
    update(current.id, (q) => ({
      ...q,
      options: q.options.map((o) => (o.id === optionId ? { ...o, votes: o.votes + 1 } : o)),
    }));
    setVoteLog((l) => [...l, { q: current.id, o: optionId }]);
  };

  const undoVote = () => {
    if (!current) return;
    const lastIdx = voteLog.map((v) => v.q).lastIndexOf(current.id);
    if (lastIdx < 0) return;
    const last = voteLog[lastIdx];
    update(current.id, (q) => ({
      ...q,
      options: q.options.map((o) => (o.id === last.o ? { ...o, votes: Math.max(0, o.votes - 1) } : o)),
    }));
    setVoteLog((l) => l.filter((_, i) => i !== lastIdx));
  };

  const resetVotes = () => {
    if (!current) return;
    update(current.id, (q) => ({
      ...q,
      status: "ready",
      options: q.options.map((o) => ({ ...o, votes: 0 })),
    }));
    setVoteLog((l) => l.filter((v) => v.q !== current.id));
    toast.success("Votes cleared for this question");
  };

  const go = (delta: number) => {
    const next = questions[index + delta];
    if (next) setCurrentId(next.id);
  };

  const canUndo = current ? voteLog.some((v) => v.q === current.id) : false;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="session-title" className="text-xs font-medium text-foreground">
            Session
          </Label>
          <Input
            id="session-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 h-10 max-w-xl border-transparent px-0 text-xl font-semibold shadow-none hover:border-border focus-visible:px-2"
          />
        </div>
        <div role="group" aria-label="View" className="inline-flex rounded-md border border-border p-0.5">
          {(["present", "edit"] as Mode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "default" : "ghost"}
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              {m === "present" ? "Present" : "Questions"}
            </Button>
          ))}
        </div>
      </div>

      {mode === "present" ? (
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

              <ResultsBoard question={current} showResults={showResults} onVote={vote} />

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
                <Button variant="outline" aria-pressed={showResults} onClick={() => setShowResults((s) => !s)}>
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
      ) : (
        <QuestionEditor
          questions={questions}
          setQuestions={setQuestions}
          onDone={(id) => {
            if (id) setCurrentId(id);
            setMode("present");
          }}
        />
      )}
    </div>
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
          <Button variant="outline" onClick={addQuestion}>
            <Plus aria-hidden="true" /> Add question
          </Button>
          <Button onClick={() => onDone()}>
            <Play aria-hidden="true" /> Present
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
