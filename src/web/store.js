import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { TableClient, odata } from '@azure/data-tables';
import { DefaultAzureCredential, ManagedIdentityCredential } from '@azure/identity';

export class LocalStore {
  constructor(file) {
    this.file = file;
    this.queue = Promise.resolve();
  }

  async init() {
    try {
      this.data = JSON.parse(await readFile(this.file, 'utf8'));
      if (!this.data.state?.round || typeof this.data.state.open !== 'boolean' || !this.data.votes) {
        throw new Error('Invalid local poll data; restore the data file from backup.');
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.data = { state: { round: randomUUID(), open: true }, votes: {} };
      await this.persist();
    }
  }

  async persist() {
    await mkdir(dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(this.data), { mode: 0o600 });
    await rename(temporary, this.file);
  }

  transaction(change) {
    const operation = this.queue.then(async () => {
      const previous = structuredClone(this.data);
      try {
        const result = change();
        await this.persist();
        return result;
      } catch (error) {
        this.data = previous;
        throw error;
      }
    });
    this.queue = operation.catch(() => {}); // Keep subsequent writes runnable after a reported failure.
    return operation;
  }

  async state() {
    await this.queue;
    return { ...this.data.state };
  }

  async configure(action) {
    return this.transaction(() => {
      if (action === 'reset') {
        this.data.state = { round: randomUUID(), open: true };
        this.data.votes = {};
      } else {
        this.data.state.open = action === 'open';
      }
      return { ...this.data.state };
    });
  }

  async vote(round, question, voter, answer) {
    return this.transaction(() => {
      const key = `${round}:${question}:${voter}`;
      if (key in this.data.votes) return false;
      this.data.votes[key] = answer;
      return true;
    });
  }

  async counts(round, question) {
    await this.queue;
    const prefix = `${round}:${question}:`;
    const counts = [0, 0, 0];
    for (const [key, answer] of Object.entries(this.data.votes)) {
      if (key.startsWith(prefix)) counts[answer]++;
    }
    return counts;
  }

  async ballot(round, voter) {
    await this.queue;
    return Array.from({ length: 6 }, (_, index) =>
      this.data.votes[`${round}:${index + 1}:${voter}`] ?? null);
  }
}

export class AzureStore {
  constructor(endpoint, tableName = 'poll') {
    const credential = process.env.NODE_ENV === 'production'
      ? new ManagedIdentityCredential()
      : new DefaultAzureCredential();
    this.table = new TableClient(endpoint, tableName, credential);
  }

  async init() {
    // Table is provisioned by Bicep, avoiding management permissions for the app.
    try {
      await this.table.createEntity({
        partitionKey: 'config', rowKey: 'state', round: randomUUID(), open: true,
      });
    } catch (error) {
      if (error.statusCode !== 409) throw error;
    }
  }

  async state() {
    const entity = await this.table.getEntity('config', 'state');
    return { round: entity.round, open: entity.open };
  }

  async configure(action) {
    // Conditional writes prevent two presenters silently overwriting one another.
    const entity = await this.table.getEntity('config', 'state');
    const state = {
      round: action === 'reset' ? randomUUID() : entity.round,
      open: action === 'reset' || action === 'open',
    };
    await this.table.updateEntity(
      { partitionKey: 'config', rowKey: 'state', ...state },
      'Replace', { etag: entity.etag },
    );
    return state;
  }

  async vote(round, question, voter, answer) {
    try {
      await this.table.createEntity({
        partitionKey: `${round}-${question}`, rowKey: voter, answer,
      });
      return true;
    } catch (error) {
      if (error.statusCode === 409) return false;
      throw error;
    }
  }

  async counts(round, question) {
    const counts = [0, 0, 0];
    for await (const entity of this.table.listEntities({
      abortSignal: AbortSignal.timeout(10000),
      queryOptions: {
        filter: odata`PartitionKey eq ${`${round}-${question}`}`,
        select: ['answer'],
      },
    })) counts[entity.answer]++;
    return counts;
  }

  async ballot(round, voter) {
    return Promise.all(Array.from({ length: 6 }, async (_, index) => {
      try {
        const entity = await this.table.getEntity(`${round}-${index + 1}`, voter);
        return entity.answer;
      } catch (error) {
        if (error.statusCode === 404) return null;
        throw error;
      }
    }));
  }
}
