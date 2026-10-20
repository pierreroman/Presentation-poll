import { SAMPLE_QUESTIONS, SESSION_TITLE, type PollQuestion } from "../../src/pages/poll-data";
import type { ClientPrincipal, PollSession } from "../../src/lib/poll-types";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface StoredPoll {
  session: PollSession;
}

export function initialPoll(): StoredPoll {
  return {
    session: {
      title: SESSION_TITLE,
      questions: structuredClone(SAMPLE_QUESTIONS),
      showResults: true,
      revision: 0,
      configRevision: 0,
    },
  };
}

export function isPresenter(principal: ClientPrincipal | null): boolean {
  return !!principal && principal.identityProvider === "aad"
    && !!principal.userId && principal.userRoles.includes("presenter");
}

export function parsePrincipal(header: string | null): ClientPrincipal | null {
  if (!header) return null;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    throw new HttpError(401, "Invalid authentication information.");
  }
  if (!isRecord(value) || typeof value.identityProvider !== "string"
    || typeof value.userId !== "string" || typeof value.userDetails !== "string"
    || !Array.isArray(value.userRoles) || !value.userRoles.every((role) => typeof role === "string")) {
    throw new HttpError(401, "Invalid authentication information.");
  }
  return {
    identityProvider: value.identityProvider,
    userId: value.userId,
    userDetails: value.userDetails,
    userRoles: value.userRoles,
  };
}

export function requirePresenter(principal: ClientPrincipal | null): void {
  if (!isPresenter(principal)) {
    throw new HttpError(principal ? 403 : 401, "An invited Microsoft presenter account is required.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new HttpError(400, `${label} must contain 1-${max} characters.`);
  }
  return value.trim();
}

function questionById(poll: StoredPoll, id: unknown): PollQuestion {
  const question = poll.session.questions.find((q) => q.id === id);
  if (!question) throw new HttpError(404, "Question not found.");
  return question;
}

export function normalizePoll(poll: StoredPoll): StoredPoll {
  const { title, showResults, revision, configRevision, questions } = poll.session;
  // Preserve existing counts while dropping legacy voting states and undo history.
  return {
    session: {
      title, showResults, revision, configRevision,
      questions: questions.map(({ id, prompt, options }) => ({
        id, prompt, options: options.map(({ id, label, votes }) => ({ id, label, votes })),
      })),
    },
  };
}

export function publicSession(poll: StoredPoll, presenter = false): PollSession {
  const session = normalizePoll(poll).session;
  if (!presenter && !session.showResults) {
    for (const q of session.questions) {
      for (const option of q.options) option.votes = 0;
    }
  }
  return session;
}

export function addVote(poll: StoredPoll, body: unknown): void {
  if (!isRecord(body)) throw new HttpError(400, "A JSON vote is required.");
  const question = questionById(poll, body.questionId);
  const option = question.options.find((o) => o.id === body.optionId);
  if (!option) throw new HttpError(400, "Answer option not found.");
  option.votes += 1;
  poll.session.revision += 1;
}

export function presenterCommand(poll: StoredPoll, body: unknown, principal: ClientPrincipal | null): void {
  requirePresenter(principal);
  if (!isRecord(body)) throw new HttpError(400, "A JSON command is required.");
  switch (body.type) {
    case "results":
      if (typeof body.showResults !== "boolean") throw new HttpError(400, "Invalid results visibility.");
      poll.session.showResults = body.showResults;
      break;
    case "resetAll": {
      for (const question of poll.session.questions) {
        for (const option of question.options) option.votes = 0;
      }
      break;
    }
    case "edit": {
      if (body.configRevision !== poll.session.configRevision) {
        throw new HttpError(409, "Another presenter edited the questions. Reload the editor before saving.");
      }
      const title = text(body.title, "Session title", 200);
      if (!Array.isArray(body.questions) || body.questions.length > 20) {
        throw new HttpError(400, "A session may contain at most 20 questions.");
      }
      const ids = new Set<string>();
      const questions = body.questions.map((value: unknown): PollQuestion => {
        if (!isRecord(value)) throw new HttpError(400, "Invalid question.");
        const id = text(value.id, "Question ID", 100);
        if (ids.has(id)) throw new HttpError(400, "Question IDs must be unique.");
        ids.add(id);
        const prompt = text(value.prompt, "Question", 500);
        if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 6) {
          throw new HttpError(400, "Each question requires 2-6 answer options.");
        }
        const old = poll.session.questions.find((q) => q.id === id);
        const optionIds = new Set<string>();
        const options = value.options.map((option: unknown) => {
          if (!isRecord(option)) throw new HttpError(400, "Invalid answer option.");
          const optionId = text(option.id, "Option ID", 100);
          if (optionIds.has(optionId)) throw new HttpError(400, "Option IDs must be unique within a question.");
          optionIds.add(optionId);
          return {
            id: optionId,
            label: text(option.label, "Answer option", 120),
            votes: old?.options.find((o) => o.id === optionId)?.votes ?? 0,
          };
        });
        return { id, prompt, options };
      });
      poll.session.title = title;
      poll.session.questions = questions;
      poll.session.configRevision += 1;
      break;
    }
    default:
      throw new HttpError(400, "Unknown presenter command.");
  }
  poll.session.revision += 1;
}
