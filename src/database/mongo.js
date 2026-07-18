import 'dotenv/config';
import { setServers } from 'node:dns';
import { isIP } from 'node:net';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI?.trim();
const databaseName = process.env.MONGO_DB_NAME?.trim() || 'infinity';

let client;
let database;
let connectionPromise;

function createClient() {
  return new MongoClient(uri, {
    maxPoolSize: 5,
    minPoolSize: 0,
    maxConnecting: 1,
    serverSelectionTimeoutMS: 10_000
  });
}

function fallbackDnsServers() {
  return (process.env.DNS_SERVERS || '1.1.1.1,8.8.8.8')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => isIP(value));
}

function isRetryableConnectionError(error) {
  return error?.hasErrorLabel?.('RetryableError')
    || error?.name === 'MongoNetworkError'
    || error?.name === 'MongoServerSelectionError'
    || String(error?.cause?.code || error?.code || '').startsWith('ERR_SSL_')
    || error?.code === 'ECONNRESET'
    || error?.code === 'ETIMEDOUT';
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectClient() {
  const servers = fallbackDnsServers();
  let dnsFallbackApplied = false;
  let lastError;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    client = createClient();
    try {
      await client.connect();
      database = client.db(databaseName);
      await database.command({ ping: 1 });
      console.log(`Connected to MongoDB database "${databaseName}".`);
      return database;
    } catch (error) {
      lastError = error;
      await client.close().catch(() => {});
      database = null;

      const isSrvRefusal = error?.code === 'ECONNREFUSED' && error?.syscall === 'querySrv';
      if (isSrvRefusal && !dnsFallbackApplied && servers.length) {
        dnsFallbackApplied = true;
        setServers(servers);
        console.warn(`MongoDB SRV lookup failed through system DNS; retrying with ${servers.join(', ')}.`);
      } else if (!isRetryableConnectionError(error) || attempt === 5) {
        throw error;
      }

      const delay = Math.min(4_000, 500 * (2 ** (attempt - 1)));
      console.warn(`MongoDB connection attempt ${attempt}/5 failed; retrying in ${delay}ms.`);
      await wait(delay);
    }
  }

  throw lastError;
}

export async function connectDatabase() {
  if (database) return database;
  if (!uri) throw new Error('Missing required environment variable: MONGO_URI');

  if (!connectionPromise) {
    connectionPromise = connectClient()
      .catch((error) => {
        connectionPromise = null;
        database = null;
        throw error;
      });
  }

  return connectionPromise;
}

export async function getDatabase() {
  return database || connectDatabase();
}

export async function closeDatabase() {
  const activeClient = client;
  client = null;
  database = null;
  connectionPromise = null;
  if (activeClient) await activeClient.close();
}
