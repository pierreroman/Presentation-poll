const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initialPoll, presenterCommand, addVote, publicSession, parsePrincipal, HttpError,
} = require("../dist/api/src/poll.js");
const { encodePoll, decodePoll, mutatePoll, loadPoll } = require("../dist/api/src/store.js");

const presenter = {
  identityProvider: "aad", userId: "invited-presenter", userDetails: "presenter@example.test",
  userRoles: ["anonymous", "authenticated", "presenter"],
};
const attendee = { ...presenter, userRoles: ["anonymous", "authenticated"] };
const command = (poll, body) => presenterCommand(poll, body, presenter);
const rejectsWith = (fn, status) => assert.throws(fn, (error) => error instanceof HttpError && error.status === status);
const vote = (poll, questionId = "q1", optionId = "q1-o0") => addVote(poll, { questionId, optionId });

for (const [name, principal, status] of [
  ["anonymous", null, 401],
  ["authenticated attendee", attendee, 403],
  ["GitHub presenter", { ...presenter, identityProvider: "github" }, 403],
]) {
  test(`${name} cannot execute any presenter command`, () => {
    const poll = initialPoll();
    const before = structuredClone(poll);
    for (const body of [
      { type: "results", showResults: false },
      { type: "resetAll" },
      { type: "edit", title: "tampered", questions: [], configRevision: 0 },
      { type: "resetAll", userRoles: ["presenter"] },
    ]) {
      rejectsWith(() => presenterCommand(poll, body, principal), status);
      assert.deepEqual(poll, before);
    }
  });
}

test("principal parser rejects malformed headers and does not grant roles by email", () => {
  rejectsWith(() => parsePrincipal("invalid"), 401);
  rejectsWith(() => parsePrincipal(Buffer.from('{"userRoles":"presenter"}').toString("base64")), 401);
  assert.equal(parsePrincipal(null), null);
  assert.deepEqual(parsePrincipal(Buffer.from(JSON.stringify(attendee)).toString("base64")), attendee);
});

test("attendees can answer any or all questions in any order without presenter action", () => {
  const poll = initialPoll();
  for (const question of [...poll.session.questions].reverse()) {
    vote(poll, question.id, question.options[0].id);
  }
  for (const question of poll.session.questions) {
    assert.equal(question.options[0].votes, 1);
    assert.equal("status" in question, false);
  }
});

test("votes require an existing question and a valid option", () => {
  const poll = initialPoll();
  rejectsWith(() => vote(poll, "q1", "q2-o0"), 400);
  rejectsWith(() => vote(poll, "missing"), 404);
  vote(poll);
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal("history" in poll, false);
});

test("vote payloads cannot change the title, roles, visibility, or other vote counts", () => {
  const poll = initialPoll();
  addVote(poll, {
    questionId: "q1", optionId: "q1-o0", votes: 999, title: "tampered",
    showResults: false, userRoles: ["presenter"], type: "resetAll",
  });
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal(poll.session.showResults, true);
  assert.notEqual(poll.session.title, "tampered");
});

test("hidden counts and legacy metadata never appear in public responses", () => {
  const poll = initialPoll();
  vote(poll);
  command(poll, { type: "results", showResults: false });
  const publicView = publicSession(poll);
  assert.equal(publicView.questions[0].options[0].votes, 0);
  assert.equal("undoQuestionIds" in publicView, false);
  assert.equal("history" in publicView, false);
  assert.equal(publicSession(poll, true).questions[0].options[0].votes, 1);
});

test("presenter reset clears every question and preserves the session configuration", () => {
  const poll = initialPoll();
  command(poll, { type: "results", showResults: false });
  for (const question of poll.session.questions) {
    for (const option of question.options) vote(poll, question.id, option.id);
  }
  const before = structuredClone(poll.session);
  command(poll, { type: "resetAll" });
  assert.equal(poll.session.title, before.title);
  assert.equal(poll.session.showResults, false);
  assert.equal(poll.session.configRevision, before.configRevision);
  assert.equal(poll.session.revision, before.revision + 1);
  assert.deepEqual(poll.session.questions, before.questions.map((q) => ({
    ...q, options: q.options.map((o) => ({ ...o, votes: 0 })),
  })));
  vote(poll, "q6", "q6-o2");
  assert.equal(poll.session.questions[5].options[2].votes, 1);
});

test("question editing preserves authoritative votes and ignores client voting states", () => {
  const poll = initialPoll();
  vote(poll);
  const questions = structuredClone(poll.session.questions);
  questions[0].prompt = "Updated statement";
  questions[0].options[0].votes = 500;
  questions[0].status = "closed";
  command(poll, { type: "edit", title: "Updated session", questions, configRevision: 0 });
  assert.equal(poll.session.questions[0].prompt, "Updated statement");
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal("status" in poll.session.questions[0], false);
  assert.equal(poll.session.configRevision, 1);
  rejectsWith(() => command(poll, { type: "edit", title: "stale", questions, configRevision: 0 }), 409);
});

test("removing an answer preserves counts for other answers", () => {
  const poll = initialPoll();
  vote(poll);
  vote(poll, "q1", "q1-o1");
  const questions = structuredClone(poll.session.questions);
  questions[0].options.shift();
  command(poll, { type: "edit", title: poll.session.title, questions, configRevision: 0 });
  assert.equal(poll.session.questions[0].options[0].id, "q1-o1");
  assert.equal(poll.session.questions[0].options[0].votes, 1);
});

test("invalid edits are rejected without changing the stored session", () => {
  for (const change of [
    (questions) => { questions[0].prompt = ""; },
    (questions) => { questions[0].options = []; },
    (questions) => { questions[0].options[1].id = questions[0].options[0].id; },
    (questions) => { questions[1].id = questions[0].id; },
    (questions) => { questions[0].options[0].label = "a".repeat(121); },
  ]) {
    const poll = initialPoll();
    const before = structuredClone(poll);
    const questions = structuredClone(poll.session.questions);
    change(questions);
    rejectsWith(() => command(poll, { type: "edit", title: poll.session.title, questions, configRevision: 0 }), 400);
    assert.deepEqual(poll, before);
  }
});

test("removed status, undo, per-question reset and unknown commands are rejected", () => {
  const poll = initialPoll();
  for (const body of [
    null, { type: "grant-role" }, { type: "status", questionId: "q1", status: "anything" },
    { type: "status", questionId: "q1", status: "open" },
    { type: "undo", questionId: "q1" }, { type: "reset", questionId: "q1" },
    { type: "results", showResults: "false" },
  ]) rejectsWith(() => command(poll, body), 400);
});

test("large sessions round-trip across Table property chunks", () => {
  const poll = initialPoll();
  poll.session.questions[0].prompt = "x".repeat(35_000);
  const entity = encodePoll(poll);
  assert.ok(entity.chunkCount > 1);
  assert.deepEqual(decodePoll(entity), poll);
});

test("sessions exceeding safe Table entity capacity fail explicitly", () => {
  const poll = initialPoll();
  poll.session.questions[0].prompt = "x".repeat(400_001);
  rejectsWith(() => encodePoll(poll), 413);
});

function memoryTable(poll = initialPoll()) {
  let entity = encodePoll(poll);
  let revision = 0;
  return {
    getEntity: async () => ({ ...structuredClone(entity), etag: String(revision) }),
    updateEntity: async (next, mode, options) => {
      assert.equal(mode, "Replace");
      if (options.etag !== String(revision)) throw { statusCode: 412 };
      entity = structuredClone(next);
      revision++;
    },
  };
}

test("concurrent votes use ETags and do not overwrite each other", async () => {
  const poll = initialPoll();
  const table = memoryTable(poll);
  await Promise.all(Array.from({ length: 6 }, () => mutatePoll((state) => vote(state), table)));
  const saved = decodePoll(await loadPoll(table));
  assert.equal(saved.session.questions[0].options[0].votes, 6);
  assert.equal("history" in saved, false);
});

test("storage failures propagate instead of returning local success", async () => {
  const error = new Error("storage unavailable");
  await assert.rejects(() => loadPoll({ getEntity: async () => { throw error; } }), error);
});

test("busy sessions return a retryable conflict after bounded retries", async () => {
  const poll = initialPoll();
  const table = memoryTable(poll);
  table.updateEntity = async () => { throw { statusCode: 412 }; };
  await assert.rejects(() => mutatePoll((state) => vote(state), table),
    (error) => error instanceof HttpError && error.status === 409);
});

test("legacy storage drops old voting states and history without losing votes", () => {
  const legacy = initialPoll();
  legacy.session.questions[0].status = "closed";
  legacy.session.questions[1].status = "ready";
  legacy.session.undoQuestionIds = ["q1"];
  legacy.session.questions[0].options[0].votes = 7;
  legacy.history = [{ questionId: "q1", optionId: "q1-o0" }];
  const normalized = decodePoll(encodePoll(legacy));
  assert.equal(normalized.session.questions[0].options[0].votes, 7);
  assert.equal("status" in normalized.session.questions[0], false);
  assert.equal("undoQuestionIds" in normalized.session, false);
  assert.equal("history" in normalized, false);
  vote(normalized);
  vote(normalized, "q2", "q2-o0");
  assert.equal(normalized.session.questions[0].options[0].votes, 8);
  assert.equal(normalized.session.questions[1].options[0].votes, 1);
  assert.equal("status" in publicSession(legacy).questions[0], false);
});

test("reset and concurrent voting are serialized without losing post-reset votes", async () => {
  const poll = initialPoll();
  vote(poll);
  vote(poll, "q2", "q2-o0");
  const table = memoryTable(poll);
  await Promise.all([
    mutatePoll((state) => command(state, { type: "resetAll" }), table),
    mutatePoll((state) => vote(state, "q2", "q2-o0"), table),
  ]);
  const saved = decodePoll(await loadPoll(table));
  assert.equal(saved.session.questions[0].options[0].votes, 0);
  assert.equal(saved.session.questions[1].options[0].votes, 1);
});

test("Static Web Apps protects all presenter pages and API routes", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/staticwebapp.config.json"), "utf8"));
  for (const route of ["/presenter", "/presenter/*", "/questions", "/questions/*", "/results", "/results-*", "/results/*", "/api/presenter/*", "/api/*"]) {
    assert.deepEqual(config.routes.find((rule) => rule.route === route)?.allowedRoles, ["presenter"]);
  }
  assert.deepEqual(config.routes.find((rule) => rule.route === "/api/session").methods, ["GET"]);
  assert.deepEqual(config.routes.find((rule) => rule.route === "/api/votes").methods, ["POST"]);
  assert.ok(config.navigationFallback.exclude.includes("/api/*"));
  assert.ok(config.navigationFallback.exclude.includes("/.auth/*"));
});
