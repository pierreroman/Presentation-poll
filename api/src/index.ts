import { app } from "@azure/functions";
import { handle } from "./http";

app.http("session", {
  route: "session",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: (request, context) => handle(request, context, false),
});

app.http("votes", {
  route: "votes",
  methods: ["POST"],
  authLevel: "anonymous",
  handler: (request, context) => handle(request, context, false),
});

app.http("presenter-session", {
  route: "presenter/session",
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: (request, context) => handle(request, context, true),
});
