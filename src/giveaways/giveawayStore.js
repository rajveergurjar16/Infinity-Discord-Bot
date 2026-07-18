import {
  mutateStoreDocument,
  readStoreDocument,
  replaceStoreDocument
} from '../database/storeRepository.js';

const STORE_KEY = 'giveaways';

const defaultStore = {
  giveaways: []
};

function normalizeStore(value) {
  return { giveaways: Array.isArray(value?.giveaways) ? value.giveaways : [] };
}

export const getGiveawayStore = () => readStoreDocument(STORE_KEY, defaultStore, normalizeStore);

export async function saveGiveawayStore(store) {
  return replaceStoreDocument(STORE_KEY, defaultStore, normalizeStore, store);
}

export async function upsertGiveaway(giveaway) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const index = store.giveaways.findIndex((item) => item.id === giveaway.id);
    if (index === -1) store.giveaways.push(giveaway);
    else store.giveaways[index] = giveaway;
    return giveaway;
  });
}

export async function getGiveaway(id) {
  const store = await getGiveawayStore();
  return store.giveaways.find((giveaway) => giveaway.id === id) ?? null;
}

export async function removeGiveaway(id) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const before = store.giveaways.length;
    store.giveaways = store.giveaways.filter((giveaway) => giveaway.id !== id && giveaway.messageId !== id);
    return before - store.giveaways.length;
  });
}

export async function updateGiveaway(id, updater) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, async (store) => {
    const index = store.giveaways.findIndex((giveaway) => giveaway.id === id);
    if (index === -1) return null;
    const next = await updater(store.giveaways[index]);
    store.giveaways[index] = next;
    return next;
  });
}

export async function listGiveaways() {
  const store = await getGiveawayStore();
  return store.giveaways;
}

export async function pruneGiveaways({ endedBefore }) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const before = store.giveaways.length;
    store.giveaways = store.giveaways.filter((giveaway) => {
      if (giveaway.status === 'active') return true;
      const finishedAt = giveaway.endedAt ?? giveaway.endsAt ?? giveaway.startedAt ?? 0;
      return finishedAt >= endedBefore;
    });
    return before - store.giveaways.length;
  });
}
