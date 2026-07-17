import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const storePath = path.resolve('data', 'auto-ping.json');
let writeQueue = Promise.resolve();

async function readStore() {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { guilds: parsed.guilds && typeof parsed.guilds === 'object' ? parsed.guilds : {} };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { guilds: {} };
  }
}

function saveStore(store) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(path.dirname(storePath), { recursive: true });
      await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
    });
  return writeQueue;
}

export async function getAutoPingConfig(guildId) {
  const store = await readStore();
  return store.guilds[guildId] || null;
}

export async function setAutoPingConfig(guildId, channelId, configuredBy) {
  const store = await readStore();
  store.guilds[guildId] = {
    guildId,
    channelId,
    configuredBy,
    configuredAt: Date.now()
  };
  await saveStore(store);
  return store.guilds[guildId];
}

export async function removeAutoPingConfig(guildId) {
  const store = await readStore();
  const existed = Boolean(store.guilds[guildId]);
  delete store.guilds[guildId];
  if (existed) await saveStore(store);
  return existed;
}
