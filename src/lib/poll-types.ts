import type { PollQuestion, PollStatus } from "../pages/poll-data";

export interface PollSession {
  title: string;
  questions: PollQuestion[];
  showResults: boolean;
  revision: number;
  configRevision: number;
  undoQuestionIds: string[];
}

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export type PresenterCommand =
  | { type: "status"; questionId: string; status: PollStatus }
  | { type: "results"; showResults: boolean }
  | { type: "undo" | "reset"; questionId: string }
  | { type: "edit"; title: string; questions: PollQuestion[]; configRevision: number };
