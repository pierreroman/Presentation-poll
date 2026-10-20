export type PollStatus = "ready" | "open" | "closed";

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface PollQuestion {
  id: string;
  prompt: string;
  options: PollOption[];
  status: PollStatus;
}

let counter = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Every question in this session uses the same three answers. */
const VERDICTS = ["Busted", "Plausible", "Confirmed"];

const q = (id: string, prompt: string, labels: string[] = VERDICTS): PollQuestion => ({
  id,
  prompt,
  status: "ready",
  options: labels.map((label, i) => ({ id: `${id}-o${i}`, label, votes: 0 })),
});

export const SESSION_TITLE = "Digital sovereignty: Busted, Plausible or Confirmed?";

export const SAMPLE_QUESTIONS: PollQuestion[] = [
  q("q1", "\u201cDigital sovereignty requires a local cloud provider.\u201d"),
  q("q2", "\u201cData residency alone addresses sovereignty.\u201d"),
  q("q3", "\u201cDisconnected is always more secure.\u201d"),
  q("q4", "\u201cSovereign means giving up modern AI.\u201d"),
  q("q5", "\u201cThe provider's engineers can access my data whenever they like.\u201d"),
  q("q6", "\u201cIf my provider is headquartered abroad, its home government can get my data.\u201d"),
];
