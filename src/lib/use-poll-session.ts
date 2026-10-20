import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ClientPrincipal, PollSession, PresenterCommand } from "./poll-types";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function isSession(value: unknown): value is PollSession {
  return record(value) && typeof value.title === "string"
    && typeof value.showResults === "boolean" && Number.isInteger(value.revision)
    && Number.isInteger(value.configRevision)
    && Array.isArray(value.questions) && value.questions.every((q: unknown) =>
      record(q) && typeof q.id === "string" && typeof q.prompt === "string"
      && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 6
      && q.options.every((o: unknown) =>
        record(o) && typeof o.id === "string" && typeof o.label === "string"
        && typeof o.votes === "number" && Number.isSafeInteger(o.votes) && o.votes >= 0));
}

async function jsonRequest(url: string, input?: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: input === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: input === undefined ? {} : { "Content-Type": "application/json", "X-Poll-Client": "web" },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
  if (response.status === 401 || response.status === 403) {
    throw new ApiError(response.status, "Presenter access was denied. Sign in with an invited Microsoft account.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(response.status, "The polling API is unavailable. Run the API through the Static Web Apps emulator locally.");
  }
  const value: unknown = await response.json();
  if (!response.ok) {
    throw new ApiError(response.status, record(value) && typeof value.error === "string"
      ? value.error : `Polling request failed (${response.status}).`);
  }
  return value;
}

function principalFrom(value: unknown): ClientPrincipal | null {
  if (!record(value) || !("clientPrincipal" in value)) throw new Error("Invalid authentication response.");
  const principal = value.clientPrincipal;
  if (principal === null) return null;
  if (!record(principal) || typeof principal.identityProvider !== "string"
    || typeof principal.userId !== "string" || typeof principal.userDetails !== "string"
    || !Array.isArray(principal.userRoles) || !principal.userRoles.every((role) => typeof role === "string")) {
    throw new Error("Invalid authentication response.");
  }
  return {
    identityProvider: principal.identityProvider,
    userId: principal.userId,
    userDetails: principal.userDetails,
    userRoles: principal.userRoles,
  };
}

export function usePollSession() {
  const [session, setSession] = useState<PollSession | null>(null);
  const [principal, setPrincipal] = useState<ClientPrincipal | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const refreshing = useRef(false);
  const mounted = useRef(true);
  const canPresent = !!principal && principal.identityProvider === "aad"
    && principal.userRoles.includes("presenter");

  const acceptSession = useCallback((value: unknown) => {
    if (!isSession(value)) throw new Error("Invalid polling response.");
    if (mounted.current) {
      setSession((previous) => !previous || value.revision >= previous.revision ? value : previous);
    }
  }, []);

  const report = useCallback((failure: unknown) => {
    if (!mounted.current) return;
    const message = failure instanceof Error ? failure.message : "The polling request failed.";
    setError(message);
    if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) {
      setPrincipal(null);
      setSession(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current || busy.current) return;
    refreshing.current = true;
    try {
      const user = principalFrom(await jsonRequest("/.auth/me"));
      const presenter = user?.identityProvider === "aad" && user.userRoles.includes("presenter");
      const value = await jsonRequest(presenter ? "/api/presenter/session" : "/api/session");
      if (mounted.current) {
        setPrincipal(user);
        acceptSession(value);
        setError("");
      }
    } catch (failure) {
      report(failure);
    } finally {
      refreshing.current = false;
    }
  }, [acceptSession, report]);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => { mounted.current = false; clearInterval(interval); };
  }, [refresh]);

  const send = async (url: string, input: unknown): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setPending(true);
    try {
      acceptSession(await jsonRequest(url, input));
      setError("");
      return true;
    } catch (failure) {
      report(failure);
      toast.error(failure instanceof Error ? failure.message : "The action failed.");
      return false;
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };

  return {
    session, principal, canPresent, error, pending, refresh,
    command: (input: PresenterCommand) => send("/api/presenter/session", input),
    vote: (questionId: string, optionId: string) => send("/api/votes", { questionId, optionId }),
  };
}
