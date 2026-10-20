import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import {
  addVote, HttpError, isPresenter, parsePrincipal, presenterCommand,
  publicSession, requirePresenter, type StoredPoll,
} from "./poll";
import { decodePoll, loadPoll, mutatePoll } from "./store";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };

interface PollStore {
  read: () => Promise<StoredPoll>;
  change: (mutate: (state: StoredPoll) => void) => Promise<StoredPoll>;
}

const durableStore: PollStore = {
  read: async () => decodePoll(await loadPoll()),
  change: mutatePoll,
};

async function body(request: HttpRequest): Promise<unknown> {
  if (request.headers.get("x-poll-client") !== "web"
    || !request.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(400, "A JSON request from the polling client is required.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "Cross-origin writes are not allowed.");
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 80_000) throw new HttpError(413, "Request is too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

export async function handle(
  request: HttpRequest, context: InvocationContext, presenter: boolean, store = durableStore,
): Promise<HttpResponseInit> {
  try {
    // Trusted only behind Static Web Apps' managed Functions gateway, not a public Functions host.
    const principal = parsePrincipal(request.headers.get("x-ms-client-principal"));
    if (presenter) requirePresenter(principal);
    if (request.method === "GET") {
      return { headers, jsonBody: publicSession(await store.read(), presenter) };
    }
    const input = await body(request);
    const poll = await store.change((state) => {
      if (presenter) presenterCommand(state, input, principal);
      else addVote(state, input);
    });
    return { headers, jsonBody: publicSession(poll, presenter || isPresenter(principal)) };
  } catch (error) {
    if (error instanceof HttpError) {
      context.warn(`Polling request rejected: ${error.status} ${error.message}`);
      return { status: error.status, headers, jsonBody: { error: error.message } };
    }
    context.error("Polling request failed.", error);
    return { status: 503, headers, jsonBody: { error: "Polling service is unavailable. Please retry shortly." } };
  }
}
