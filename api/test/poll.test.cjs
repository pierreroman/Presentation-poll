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
const open = (poll, id = "q1") => command(poll, { type: "status", questionId: id, status: "open" });
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
      { type: "status", questionId: "q1", status: "open" },
      { type: "results", showResults: false },
      { type: "undo", questionId: "q1" },
      { type: "reset", questionId: "q1" },
      { type: "edit", title: "tampered", questions: [], configRevision: 0 },
      { type: "status", questionId: "q1", status: "open", userRoles: ["presenter"] },
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

test("only one question can be open", () => {
  const poll = initialPoll();
  open(poll);
  open(poll, "q2");
  assert.equal(poll.session.questions[0].status, "closed");
  assert.equal(poll.session.questions[1].status, "open");
});

test("votes require an open question and a valid option", () => {
  const poll = initialPoll();
  rejectsWith(() => vote(poll), 409);
  open(poll);
  rejectsWith(() => vote(poll, "q1", "q2-o0"), 400);
  rejectsWith(() => vote(poll, "missing"), 404);
  vote(poll);
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal(poll.history.length, 1);
});

test("vote payloads cannot change the title, roles, visibility, or other vote counts", () => {
  const poll = initialPoll();
  open(poll);
  addVote(poll, {
    questionId: "q1", optionId: "q1-o0", votes: 999, title: "tampered",
    showResults: false, userRoles: ["presenter"], type: "reset",
  });
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal(poll.session.showResults, true);
  assert.notEqual(poll.session.title, "tampered");
});

test("hidden counts and undo metadata never appear in public responses", () => {
  const poll = initialPoll();
  open(poll);
  vote(poll);
  command(poll, { type: "results", showResults: false });
  const publicView = publicSession(poll);
  assert.equal(publicView.questions[0].options[0].votes, 0);
  assert.deepEqual(publicView.undoQuestionIds, []);
  assert.equal("history" in publicView, false);
  assert.equal(publicSession(poll, true).questions[0].options[0].votes, 1);
  assert.deepEqual(publicSession(poll, true).undoQuestionIds, ["q1"]);
});

test("undo removes only the last vote for the selected question", () => {
  const poll = initialPoll();
  open(poll);
  vote(poll);
  vote(poll, "q1", "q1-o1");
  open(poll, "q2");
  vote(poll, "q2", "q2-o0");
  command(poll, { type: "undo", questionId: "q1" });
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal(poll.session.questions[0].options[1].votes, 0);
  assert.equal(poll.session.questions[1].options[0].votes, 1);
});

test("reset clears counts and history only for the selected question", () => {
  const poll = initialPoll();
  open(poll);
  vote(poll);
  open(poll, "q2");
  vote(poll, "q2", "q2-o0");
  command(poll, { type: "reset", questionId: "q1" });
  assert.equal(poll.session.questions[0].status, "ready");
  assert.equal(poll.session.questions[0].options[0].votes, 0);
  assert.equal(poll.session.questions[1].options[0].votes, 1);
  assert.deepEqual(publicSession(poll, true).undoQuestionIds, ["q2"]);
});

test("question editing preserves authoritative votes and statuses, ignoring client values", () => {
  const poll = initialPoll();
  open(poll);
  vote(poll);
  const questions = structuredClone(poll.session.questions);
  questions[0].prompt = "Updated statement";
  questions[0].options[0].votes = 500;
  questions[0].status = "closed";
  command(poll, { type: "edit", title: "Updated session", questions, configRevision: 0 });
  assert.equal(poll.session.questions[0].prompt, "Updated statement");
  assert.equal(poll.session.questions[0].options[0].votes, 1);
  assert.equal(poll.session.questions[0].status, "open");
  assert.equal(poll.session.configRevision, 1);
  rejectsWith(() => command(poll, { type: "edit", title: "stale", questions, configRevision: 0 }), 409);
});

test("removing an answer removes its undo history", () => {
  const poll = initialPoll();
  open(poll);
  vote(poll);
  const questions = structuredClone(poll.session.questions);
  questions[0].options.shift();
  command(poll, { type: "edit", title: poll.session.title, questions, configRevision: 0 });
  assert.deepEqual(poll.history, []);
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

test("unknown commands and malformed status/visibility are rejected", () => {
  const poll = initialPoll();
  for (const body of [
    null, { type: "grant-role" }, { type: "status", questionId: "q1", status: "anything" },
    { type: "results", showResults: "false" },
  ]) rejectsWith(() => command(poll, body), 400);
});

test("large sessions round-trip across Table property chunks", () => {
  const poll = initialPoll();
  poll.history = Array.from({ length: 1000 }, () => ({ questionId: "q1", optionId: "q1-o0" }));
  const entity = encodePoll(poll);
  assert.ok(entity.chunkCount > 1);
  assert.deepEqual(decodePoll(entity), poll);
});

test("sessions exceeding safe Table entity capacity fail explicitly", () => {
  const poll = initialPoll();
  poll.history = Array.from({ length: 15000 }, () => ({ questionId: "q1", optionId: "q1-o0" }));
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
  open(poll);
  const table = memoryTable(poll);
  await Promise.all(Array.from({ length: 6 }, () => mutatePoll((state) => vote(state), table)));
  const saved = decodePoll(await loadPoll(table));
  assert.equal(saved.session.questions[0].options[0].votes, 6);
  assert.equal(saved.history.length, 6);
});

test("storage failures propagate instead of returning local success", async () => {
  const error = new Error("storage unavailable");
  await assert.rejects(() => loadPoll({ getEntity: async () => { throw error; } }), error);
});

test("busy sessions return a retryable conflict after bounded retries", async () => {
  const poll = initialPoll();
  open(poll);
  const table = memoryTable(poll);
  table.updateEntity = async () => { throw { statusCode: 412 }; };
  await assert.rejects(() => mutatePoll((state) => vote(state), table),
    (error) => error instanceof HttpError && error.status === 409);
});

test("Static Web Apps protects all presenter pages and API routes", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/staticwebapp.config.json"), "utf8"));
  for (const route of ["/presenter", "/presenter/*", "/questions", "/questions/*", "/api/presenter/*", "/api/*"]) {
    assert.deepEqual(config.routes.find((rule) => rule.route === route)?.allowedRoles, ["presenter"]);
  }
  assert.deepEqual(config.routes.find((rule) => rule.route === "/api/session").methods, ["GET"]);
  assert.deepEqual(config.routes.find((rule) => rule.route === "/api/votes").methods, ["POST"]);
  assert.ok(config.navigationFallback.exclude.includes("/api/*"));
  assert.ok(config.navigationFallback.exclude.includes("/.auth/*"));
});
