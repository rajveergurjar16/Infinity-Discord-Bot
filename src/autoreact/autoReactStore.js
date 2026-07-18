import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const storePath = path.resolve('data', 'auto-reactions.json');

const defaultStore = {
  rules: []
};

export async function getAutoReactStore() {
  try {
    const raw = await readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaultStore, ...parsed };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaultStore };
  }
}

export async function saveAutoReactStore(store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

export async function addAutoReactRule(rule) {
  const store = await getAutoReactStore();
  const existingIndex = store.rules.findIndex(
    (item) =>
      item.guildId === rule.guildId &&
      item.type === rule.type &&
      item.targetId === rule.targetId &&
      item.reactionEmoji === rule.reactionEmoji
  );

  if (existingIndex === -1) {
    store.rules.push(rule);
  } else {
    store.rules[existingIndex] = {
      ...store.rules[existingIndex],
      ...rule,
      id: store.rules[existingIndex].id
    };
  }

  await saveAutoReactStore(store);
  return existingIndex === -1 ? rule : store.rules[existingIndex];
}

export async function removeAutoReactRule(guildId, id) {
  const store = await getAutoReactStore();
  const nextRules = store.rules.filter((rule) => !(rule.guildId === guildId && rule.id === id));

  if (nextRules.length !== store.rules.length) {
    await saveAutoReactStore({ ...store, rules: nextRules });
  }

  return store.rules.length - nextRules.length;
}

export async function listAutoReactRules(guildId) {
  const store = await getAutoReactStore();
  return store.rules.filter((rule) => rule.guildId === guildId);
}
