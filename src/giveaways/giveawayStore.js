import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const storePath = path.resolve('data', 'giveaways.json');

const defaultStore = {
  giveaways: []
};

export async function getGiveawayStore() {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultStore, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaultStore };
  }
}

export async function saveGiveawayStore(store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

export async function upsertGiveaway(giveaway) {
  const store = await getGiveawayStore();
  const index = store.giveaways.findIndex((item) => item.id === giveaway.id);

  if (index === -1) {
    store.giveaways.push(giveaway);
  } else {
    store.giveaways[index] = giveaway;
  }

  await saveGiveawayStore(store);
  return giveaway;
}

export async function getGiveaway(id) {
  const store = await getGiveawayStore();
  return store.giveaways.find((giveaway) => giveaway.id === id) ?? null;
}

export async function removeGiveaway(id) {
  const store = await getGiveawayStore();
  const nextGiveaways = store.giveaways.filter((giveaway) => giveaway.id !== id && giveaway.messageId !== id);

  if (nextGiveaways.length !== store.giveaways.length) {
    await saveGiveawayStore({ ...store, giveaways: nextGiveaways });
  }

  return store.giveaways.length - nextGiveaways.length;
}

export async function updateGiveaway(id, updater) {
  const store = await getGiveawayStore();
  const index = store.giveaways.findIndex((giveaway) => giveaway.id === id);
  if (index === -1) return null;

  const next = await updater(store.giveaways[index]);
  store.giveaways[index] = next;
  await saveGiveawayStore(store);
  return next;
}

export async function listGiveaways() {
  const store = await getGiveawayStore();
  return store.giveaways;
}

export async function pruneGiveaways({ endedBefore }) {
  const store = await getGiveawayStore();
  const nextGiveaways = store.giveaways.filter((giveaway) => {
    if (giveaway.status === 'active') return true;
    const finishedAt = giveaway.endedAt ?? giveaway.endsAt ?? giveaway.startedAt ?? 0;
    return finishedAt >= endedBefore;
  });

  if (nextGiveaways.length !== store.giveaways.length) {
    await saveGiveawayStore({ ...store, giveaways: nextGiveaways });
  }

  return store.giveaways.length - nextGiveaways.length;
}
