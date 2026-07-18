import { getDatabase } from './mongo.js';

const COLLECTION_NAME = 'stores';
const MAX_WRITE_ATTEMPTS = 30;

const clone = (value) => structuredClone(value);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isTransientMongoError(error) {
  return error?.hasErrorLabel?.('RetryableError')
    || error?.name === 'MongoNetworkError'
    || error?.name === 'MongoServerSelectionError'
    || String(error?.cause?.code || error?.code || '').startsWith('ERR_SSL_')
    || ['ECONNRESET', 'ETIMEDOUT'].includes(error?.code);
}

async function withMongoRetry(operation) {
  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientMongoError(error) || attempt === 5) throw error;
      await wait(Math.min(2_000, 150 * (2 ** (attempt - 1))));
    }
  }
  throw lastError;
}

async function conflictBackoff(attempt) {
  const ceiling = Math.min(150, 8 + (attempt * 6));
  await wait(5 + Math.floor(Math.random() * ceiling));
}

async function collection() {
  return (await getDatabase()).collection(COLLECTION_NAME);
}

export async function readStoreDocument(key, defaults, normalize = (value) => value) {
  const stores = await collection();
  const document = await withMongoRetry(() => stores.findOne({ _id: key }));
  return normalize(clone(document?.data ?? defaults));
}

export async function mutateStoreDocument(
  key,
  defaults,
  normalize,
  updater
) {
  const stores = await collection();

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const document = await withMongoRetry(() => stores.findOne({ _id: key }));
    const version = Number.isInteger(document?.version) ? document.version : 0;
    const value = normalize(clone(document?.data ?? defaults));
    const result = await updater(value);
    const data = normalize(value);
    const updatedAt = new Date();

    if (document) {
      const update = await stores.updateOne(
        { _id: key, version },
        { $set: { data, updatedAt }, $inc: { version: 1 } }
      );
      if (update.matchedCount === 1) return result;
      await conflictBackoff(attempt);
      continue;
    }

    try {
      await stores.insertOne({ _id: key, version: 1, data, updatedAt });
      return result;
    } catch (error) {
      if (error?.code !== 11000) throw error;
      await conflictBackoff(attempt);
    }
  }

  throw new Error(`Concurrent database updates prevented saving store: ${key}`);
}

export function replaceStoreDocument(key, defaults, normalize, nextValue) {
  return mutateStoreDocument(key, defaults, normalize, (current) => {
    for (const property of Object.keys(current)) delete current[property];
    Object.assign(current, normalize(clone(nextValue)));
    return clone(current);
  });
}

export async function importStoreDocument(key, data, { overwrite = false } = {}) {
  const stores = await collection();
  const updatedAt = new Date();
  if (overwrite) {
    await stores.updateOne(
      { _id: key },
      { $set: { data: clone(data), updatedAt }, $inc: { version: 1 } },
      { upsert: true }
    );
    return 'replaced';
  }

  const result = await stores.updateOne(
    { _id: key },
    { $setOnInsert: { data: clone(data), version: 1, updatedAt } },
    { upsert: true }
  );
  return result.upsertedCount ? 'inserted' : 'skipped';
}

export async function listStoreDocuments() {
  const stores = await collection();
  return withMongoRetry(() => stores
    .find({}, { projection: { _id: 1, version: 1, updatedAt: 1 } })
    .sort({ _id: 1 })
    .toArray());
}
