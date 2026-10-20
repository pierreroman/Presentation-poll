const { test } = require("node:test");
const assert = require("node:assert/strict");
const { HttpRequest } = require("@azure/functions");
const { handle } = require("../dist/api/src/http.js");
const { initialPoll, presenterCommand } = require("../dist/api/src/poll.js");

const presenter = {
  identityProvider: "aad", userId: "invited", userDetails: "presenter@example.test",
  userRoles: ["anonymous", "authenticated", "presenter"],
};
const context = { warn: () => {}, error: () => {} };

function request({ principal, method = "POST", input, raw, headers = {} } = {}) {
  return new HttpRequest({
    method, url: "https://poll.example.test/api/presenter/session",
    headers: {
      "content-type": "application/json", "x-poll-client": "web",
      ...(principal ? { "x-ms-client-principal": Buffer.from(JSON.stringify(principal)).toString("base64") } : {}),
      ...headers,
    },
    ...(method === "POST" ? { body: { string: raw ?? JSON.stringify(input ?? {}) } } : {}),
  });
}

function memoryStore() {
  let poll = initialPoll();
  return {
    read: async () => structuredClone(poll),
    change: async (mutate) => {
      const next = structuredClone(poll);
      mutate(next);
      poll = next;
      return structuredClone(poll);
    },
  };
}

test("direct private GET and POST requests reject anonymous callers before accessing storage", async () => {
  const forbiddenStore = {
    read: () => { throw new Error("Storage must not be accessed."); },
    change: () => { throw new Error("Storage must not be accessed."); },
  };
  for (const method of ["GET", "POST"]) {
    const response = await handle(request({ method }), context, true, forbiddenStore);
    assert.equal(response.status, 401);
    assert.match(response.jsonBody.error, /invited Microsoft presenter/);
  }
});

test("authenticated attendees cannot access private endpoints even with forged body roles", async () => {
  const response = await handle(request({
    principal: { ...presenter, userRoles: ["anonymous", "authenticated"] },
    input: { type: "resetAll", userRoles: ["presenter"] },
  }), context, true, memoryStore());
  assert.equal(response.status, 403);
});

test("attendees can vote on multiple questions without presenter action and state is shared", async () => {
  const store = memoryStore();
  const voted = await handle(request({
    input: { questionId: "q1", optionId: "q1-o0" },
  }), context, false, store);
  assert.equal(voted.jsonBody.questions[0].options[0].votes, 1);
  const otherVote = await handle(request({
    input: { questionId: "q6", optionId: "q6-o2" },
  }), context, false, store);
  assert.equal(otherVote.jsonBody.questions[5].options[2].votes, 1);
  const read = await handle(request({ method: "GET" }), context, false, store);
  assert.equal(read.jsonBody.questions[0].options[0].votes, 1);
  assert.equal(read.jsonBody.questions[5].options[2].votes, 1);
  assert.equal(read.headers["Cache-Control"], "no-store");
});

test("hidden results are redacted on both public GET and vote responses", async () => {
  const store = memoryStore();
  await store.change((poll) => {
    presenterCommand(poll, { type: "results", showResults: false }, presenter);
  });
  const voted = await handle(request({ input: { questionId: "q1", optionId: "q1-o0" } }), context, false, store);
  const read = await handle(request({ method: "GET" }), context, false, store);
  assert.equal(voted.jsonBody.questions[0].options[0].votes, 0);
  assert.equal(read.jsonBody.questions[0].options[0].votes, 0);
  const admin = await handle(request({ method: "GET", principal: presenter }), context, true, store);
  assert.equal(admin.jsonBody.questions[0].options[0].votes, 1);
});

test("only an invited presenter can reset all shared votes through the private API", async () => {
  const store = memoryStore();
  for (const [questionId, optionId] of [["q1", "q1-o0"], ["q6", "q6-o2"]]) {
    await handle(request({ input: { questionId, optionId } }), context, false, store);
  }
  const denied = await handle(request({ input: { type: "resetAll" } }), context, true, store);
  assert.equal(denied.status, 401);
  assert.equal((await store.read()).session.questions[0].options[0].votes, 1);
  const reset = await handle(request({ principal: presenter, input: { type: "resetAll" } }), context, true, store);
  assert.equal(reset.status ?? 200, 200);
  assert.ok(reset.jsonBody.questions.every((q) => q.options.every((o) => o.votes === 0)));
  const next = await handle(request({ input: { questionId: "q6", optionId: "q6-o2" } }), context, false, store);
  assert.equal(next.jsonBody.questions[5].options[2].votes, 1);
});

test("cross-site writes, malformed JSON and oversized payloads are rejected", async () => {
  for (const [options, status] of [
    [{ headers: { "sec-fetch-site": "cross-site" } }, 403],
    [{ headers: { "x-poll-client": "" } }, 400],
    [{ raw: "not JSON" }, 400],
    [{ raw: JSON.stringify({ text: "x".repeat(80_001) }) }, 413],
  ]) {
    const response = await handle(request(options), context, false, memoryStore());
    assert.equal(response.status, status);
  }
});

test("storage outages are logged and return an explicit service-unavailable response", async () => {
  let logged = false;
  const response = await handle(request({ method: "GET" }), {
    ...context, error: () => { logged = true; },
  }, false, { read: async () => { throw new Error("secret database detail"); } });
  assert.equal(response.status, 503);
  assert.equal(logged, true);
  assert.doesNotMatch(JSON.stringify(response.jsonBody), /secret database detail/);
});
