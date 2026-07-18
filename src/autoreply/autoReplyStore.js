import {
  mutateStoreDocument,
  readStoreDocument,
  replaceStoreDocument
} from '../database/storeRepository.js';

const STORE_KEY = 'auto-replies';

const defaultStore = {
  rules: [],
  whitelist: []
};

function normalizeStore(value) {
  return {
    rules: Array.isArray(value?.rules) ? value.rules : [],
    whitelist: Array.isArray(value?.whitelist) ? value.whitelist : []
  };
}

export const getAutoReplyStore = () => readStoreDocument(STORE_KEY, defaultStore, normalizeStore);

export async function saveAutoReplyStore(store) {
  return replaceStoreDocument(STORE_KEY, defaultStore, normalizeStore, store);
}

export async function addAutoReplyRule(rule) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const existingIndex = store.rules.findIndex(
      (item) => item.guildId === rule.guildId && item.trigger.toLowerCase() === rule.trigger.toLowerCase()
    );
    if (existingIndex === -1) store.rules.push(rule);
    else store.rules[existingIndex] = { ...store.rules[existingIndex], ...rule };
    return rule;
  });
}

export async function removeAutoReplyRule(guildId, id) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const before = store.rules.length;
    store.rules = store.rules.filter((rule) => !(rule.guildId === guildId && rule.id === id));
    return before - store.rules.length;
  });
}

export async function listAutoReplyRules(guildId) {
  const store = await getAutoReplyStore();
  return store.rules.filter((rule) => rule.guildId === guildId);
}

export async function addAutoReplyWhitelistUser(guildId, userId) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const exists = store.whitelist.some((item) => item.guildId === guildId && item.userId === userId);
    if (!exists) store.whitelist.push({ guildId, userId, addedAt: Date.now() });
    return { guildId, userId };
  });
}

export async function removeAutoReplyWhitelistUser(guildId, userId) {
  return mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, (store) => {
    const before = store.whitelist.length;
    store.whitelist = store.whitelist.filter((item) => !(item.guildId === guildId && item.userId === userId));
    return before - store.whitelist.length;
  });
}

export async function listAutoReplyWhitelist(guildId) {
  const store = await getAutoReplyStore();
  return store.whitelist.filter((item) => item.guildId === guildId);
}

export async function isAutoReplyWhitelisted(guildId, userId) {
  const whitelist = await listAutoReplyWhitelist(guildId);
  return whitelist.some((item) => item.userId === userId);
}
