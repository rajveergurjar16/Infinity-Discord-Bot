import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const storePath = path.resolve('data', 'auto-replies.json');

const defaultStore = {
  rules: []
};

export async function getAutoReplyStore() {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultStore, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaultStore };
  }
}

export async function saveAutoReplyStore(store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

export async function addAutoReplyRule(rule) {
  const store = await getAutoReplyStore();
  const existingIndex = store.rules.findIndex(
    (item) => item.guildId === rule.guildId && item.trigger.toLowerCase() === rule.trigger.toLowerCase()
  );

  if (existingIndex === -1) {
    store.rules.push(rule);
  } else {
    store.rules[existingIndex] = { ...store.rules[existingIndex], ...rule };
  }

  await saveAutoReplyStore(store);
  return rule;
}

export async function removeAutoReplyRule(guildId, id) {
  const store = await getAutoReplyStore();
  const nextRules = store.rules.filter((rule) => !(rule.guildId === guildId && rule.id === id));

  if (nextRules.length !== store.rules.length) {
    await saveAutoReplyStore({ ...store, rules: nextRules });
  }

  return store.rules.length - nextRules.length;
}

export async function listAutoReplyRules(guildId) {
  const store = await getAutoReplyStore();
  return store.rules.filter((rule) => rule.guildId === guildId);
}
