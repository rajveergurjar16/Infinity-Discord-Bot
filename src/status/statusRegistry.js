import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const registryPath = path.resolve('data', 'status-bots.json');
const temporaryPath = `${registryPath}.tmp`;
let mutationQueue = Promise.resolve();

function normalizedStore(value) {
  const bots = Array.isArray(value?.bots) ? value.bots : [];
  return {
    bots: bots.filter((bot) =>
      typeof bot?.clientId === 'string' &&
      typeof bot?.name === 'string' &&
      typeof bot?.statusUrl === 'string' &&
      typeof bot?.apiKey === 'string' &&
      typeof bot?.channelId === 'string' &&
      typeof bot?.revision === 'string'
    ).map((bot) => ({
      clientId: bot.clientId,
      name: bot.name,
      avatarUrl: typeof bot.avatarUrl === 'string' ? bot.avatarUrl : '',
      statusUrl: bot.statusUrl,
      apiKey: bot.apiKey,
      channelId: bot.channelId,
      revision: bot.revision,
      lastOnline: typeof bot.lastOnline === 'boolean' ? bot.lastOnline : null,
      stateChangedAt: Number.isFinite(bot.stateChangedAt) && bot.stateChangedAt > 0
        ? bot.stateChangedAt
        : Date.now(),
      pingText: typeof bot.pingText === 'string' ? bot.pingText : ''
    }))
  };
}

async function readStore() {
  try {
    return normalizedStore(JSON.parse(await readFile(registryPath, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { bots: [] };
    throw error;
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(registryPath), { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(normalizedStore(store), null, 2), {
    encoding: 'utf8',
    mode: 0o600
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, registryPath);
}

function mutateStore(updater) {
  const operation = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await updater(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function listStatusBots() {
  await mutationQueue;
  return (await readStore()).bots;
}

export function upsertStatusBot(bot) {
  return mutateStore((store) => {
    const index = store.bots.findIndex((item) => item.clientId === bot.clientId);
    const created = index === -1;
    if (created) store.bots.push(bot);
    else store.bots[index] = bot;
    return { created, bot };
  });
}

export function removeStatusBot(clientId) {
  return mutateStore((store) => {
    const index = store.bots.findIndex((item) => item.clientId === clientId);
    if (index === -1) return null;
    return store.bots.splice(index, 1)[0];
  });
}

export function updateStatusBotState(revision, online, stateChangedAt = Date.now()) {
  return mutateStore((store) => {
    const bot = store.bots.find((item) => item.revision === revision);
    if (!bot) return false;
    bot.lastOnline = online;
    bot.stateChangedAt = stateChangedAt;
    return true;
  });
}
