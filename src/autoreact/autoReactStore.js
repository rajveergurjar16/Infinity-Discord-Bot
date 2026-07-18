import {
  mutateStoreDocument,
  readStoreDocument,
  replaceStoreDocument
} from '../database/storeRepository.js';

const STORE_KEY = 'auto-reactions';

const defaultStore = {
  rules: []
};

function normalizeStore(value) {
  return { rules: Array.isArray(value?.rules) ? value.rules : [] };
}

export const getAutoReactStore = () => readStoreDocument(STORE_KEY, defaultStore, normalizeStore);

export async function saveAutoReactStore(store) {
  return replaceStoreDocument(STORE_KEY, defaultStore, normalizeStore, store);
}

export async function addAutoReactRule(rule) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const existingIndex = store.rules.findIndex(
      (item) =>
        item.guildId === rule.guildId &&
        item.type === rule.type &&
        item.targetId === rule.targetId &&
        item.reactionEmoji === rule.reactionEmoji
    );

    if (existingIndex === -1) store.rules.push(rule);
    else store.rules[existingIndex] = {
      ...store.rules[existingIndex],
      ...rule,
      id: store.rules[existingIndex].id
    };
    return existingIndex === -1 ? rule : store.rules[existingIndex];
  });
}

export async function removeAutoReactRule(guildId, id) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const before = store.rules.length;
    store.rules = store.rules.filter((rule) => !(rule.guildId === guildId && rule.id === id));
    return before - store.rules.length;
  });
}

export async function listAutoReactRules(guildId) {
  const store = await getAutoReactStore();
  return store.rules.filter((rule) => rule.guildId === guildId);
}
