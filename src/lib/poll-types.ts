import type { PollQuestion } from "../pages/poll-data";

export interface PollSession {
  title: string;
  questions: PollQuestion[];
  showResults: boolean;
  revision: number;
  configRevision: number;
}

export interface ClientPrincipal {
  identityProvider: string;
  userId: string;
  userDetails: string;
  userRoles: string[];
}

export type PresenterCommand =
  | { type: "results"; showResults: boolean }
  | { type: "resetAll" }
  | { type: "edit"; title: string; questions: PollQuestion[]; configRevision: number };
