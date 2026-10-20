import { TableClient, type TableEntityResult } from "@azure/data-tables";
import { HttpError, initialPoll, normalizePoll, type StoredPoll } from "./poll";

interface PollEntity {
  chunkCount: number;
  [key: string]: string | number;
}

const keys = { partitionKey: "debunkers", rowKey: "session" };
let client: TableClient | undefined;

function table(): TableClient {
  if (!client) {
    const connection = process.env.POLL_STORAGE_CONNECTION_STRING;
    if (!connection) throw new Error("POLL_STORAGE_CONNECTION_STRING is not configured.");
    client = TableClient.fromConnectionString(connection, "PollSessions");
  }
  return client;
}

function hasStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null
    && "statusCode" in error && error.statusCode === status;
}

export function encodePoll(poll: StoredPoll): PollEntity & typeof keys {
  const json = JSON.stringify(poll);
  if (json.length > 400_000) {
    throw new HttpError(413, "This session has reached storage capacity. Reduce the question data before saving.");
  }
  const chunks: string[] = [];
  for (let start = 0; start < json.length;) {
    let end = Math.min(start + 30_000, json.length);
    // Do not split a Unicode surrogate pair across Table string properties.
    const last = json.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) end--;
    chunks.push(json.slice(start, end));
    start = end;
  }
  const entity: PollEntity & typeof keys = { ...keys, chunkCount: chunks.length };
  for (let i = 0; i < chunks.length; i++) {
    entity[`data${i}`] = chunks[i];
  }
  return entity;
}

export function decodePoll(entity: PollEntity): StoredPoll {
  let json = "";
  for (let i = 0; i < entity.chunkCount; i++) {
    if (typeof entity[`data${i}`] !== "string") throw new Error("Stored session data is incomplete.");
    json += entity[`data${i}`];
  }
  return normalizePoll(JSON.parse(json) as StoredPoll);
}

export async function loadPoll(client = table()): Promise<TableEntityResult<PollEntity>> {
  try {
    return await client.getEntity<PollEntity>(keys.partitionKey, keys.rowKey);
  } catch (error) {
    if (!hasStatus(error, 404)) throw error;
    try {
      await client.createEntity(encodePoll(initialPoll()));
    } catch (createError) {
      if (!hasStatus(createError, 409)) throw createError;
    }
    return client.getEntity<PollEntity>(keys.partitionKey, keys.rowKey);
  }
}

export async function mutatePoll(change: (poll: StoredPoll) => void, client = table()): Promise<StoredPoll> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const entity = await loadPoll(client);
    const poll = decodePoll(entity);
    change(poll);
    try {
      await client.updateEntity(encodePoll(poll), "Replace", { etag: entity.etag });
      return poll;
    } catch (error) {
      if (!hasStatus(error, 412)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20 * (attempt + 1)));
    }
  }
  throw new HttpError(409, "The session is busy. Please retry your action.");
}
