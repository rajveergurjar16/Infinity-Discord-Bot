import { mutateStoreDocument, readStoreDocument } from '../database/storeRepository.js';

const STORE_KEY = 'auto-ping';
const defaults = { guilds: {} };

function normalizeConfig(guildId, value) {
  if (!/^\d{17,20}$/.test(guildId) || typeof value?.channelId !== 'string') return null;
  return {
    guildId,
    channelId: value.channelId,
    configuredBy: typeof value.configuredBy === 'string' ? value.configuredBy : '',
    configuredAt: Number.isFinite(value.configuredAt) ? value.configuredAt : Date.now()
  };
}

function normalizeStore(value) {
  const guilds = {};
  if (!value?.guilds || typeof value.guilds !== 'object') return { guilds };

  for (const [guildId, saved] of Object.entries(value.guilds)) {
    const candidates = Array.isArray(saved)
      ? saved
      : Array.isArray(saved?.channels)
        ? saved.channels
        : [saved];
    const channels = candidates
      .map((item) => normalizeConfig(guildId, item))
      .filter(Boolean)
      .filter((item, index, all) => all.findIndex((entry) => entry.channelId === item.channelId) === index);
    if (channels.length) guilds[guildId] = channels;
  }

  return { guilds };
}

const readStore = () => readStoreDocument(STORE_KEY, defaults, normalizeStore);
const mutateStore = (updater) => mutateStoreDocument(STORE_KEY, defaults, normalizeStore, updater);

export async function listAutoPingConfigs(guildId) {
  return (await readStore()).guilds[guildId] || [];
}

export async function getAutoPingConfig(guildId) {
  return (await listAutoPingConfigs(guildId))[0] || null;
}

export function addAutoPingConfig(guildId, channelId, configuredBy) {
  return mutateStore((store) => {
    const channels = store.guilds[guildId] || [];
    const config = { guildId, channelId, configuredBy, configuredAt: Date.now() };
    const index = channels.findIndex((item) => item.channelId === channelId);
    if (index === -1) channels.push(config);
    else channels[index] = config;
    store.guilds[guildId] = channels;
    return { config, created: index === -1 };
  });
}

export const setAutoPingConfig = addAutoPingConfig;

export function removeAutoPingConfig(guildId, channelId = null) {
  return mutateStore((store) => {
    const channels = store.guilds[guildId] || [];
    const next = channelId
      ? channels.filter((item) => item.channelId !== channelId)
      : [];
    const removed = channels.length - next.length;
    if (next.length) store.guilds[guildId] = next;
    else delete store.guilds[guildId];
    return removed;
  });
}
