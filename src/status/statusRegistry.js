import { mutateStoreDocument, readStoreDocument } from '../database/storeRepository.js';

const STORE_KEY = 'status-bots';
const defaults = { bots: [], panels: [] };

function normalizedStore(value) {
  const bots = Array.isArray(value?.bots) ? value.bots : [];
  const panels = Array.isArray(value?.panels) ? value.panels : [];
  return {
    bots: bots.filter((bot) =>
      typeof (bot?.userId ?? bot?.clientId) === 'string' &&
      typeof bot?.name === 'string' &&
      typeof bot?.statusUrl === 'string' &&
      typeof bot?.apiKey === 'string' &&
      typeof bot?.channelId === 'string' &&
      typeof bot?.revision === 'string'
    ).map((bot) => ({
      userId: bot.userId ?? bot.clientId,
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
      pingText: typeof bot.pingText === 'string' ? bot.pingText : '',
      ownerId: typeof bot.ownerId === 'string' ? bot.ownerId : '',
      createdAt: Number.isFinite(bot.createdAt) && bot.createdAt > 0 ? bot.createdAt : Date.now(),
      lastObservedAt: Number.isFinite(bot.lastObservedAt) && bot.lastObservedAt > 0
        ? bot.lastObservedAt
        : Date.now(),
      totalObservedMs: Number.isFinite(bot.totalObservedMs) && bot.totalObservedMs >= 0 ? bot.totalObservedMs : 0,
      onlineObservedMs: Number.isFinite(bot.onlineObservedMs) && bot.onlineObservedMs >= 0 ? bot.onlineObservedMs : 0
    })),
    panels: panels.filter((panel) =>
      typeof panel.guildId === 'string' &&
      typeof panel.channelId === 'string' &&
      typeof panel.messageId === 'string' &&
      typeof panel.ownerId === 'string'
    ).map((panel) => ({
      guildId: panel.guildId,
      channelId: panel.channelId,
      messageId: panel.messageId,
      ownerId: panel.ownerId,
      createdAt: Number.isFinite(panel.createdAt) && panel.createdAt > 0 ? panel.createdAt : Date.now()
    }))
  };
}

const readStore = () => readStoreDocument(STORE_KEY, defaults, normalizedStore);
const mutateStore = (updater) => mutateStoreDocument(STORE_KEY, defaults, normalizedStore, updater);

export async function listStatusBots() {
  return (await readStore()).bots;
}

export async function listStatusPanels() {
  return (await readStore()).panels;
}

export function upsertStatusBot(bot) {
  return mutateStore((store) => {
    const index = store.bots.findIndex((item) => item.userId === bot.userId);
    const created = index === -1;
    if (created) store.bots.push(bot);
    else store.bots[index] = bot;
    return { created, bot };
  });
}

export function upsertStatusPanel(panel) {
  return mutateStore((store) => {
    const index = store.panels.findIndex((item) => item.guildId === panel.guildId);
    const created = index === -1;
    if (created) store.panels.push(panel);
    else store.panels[index] = { ...store.panels[index], ...panel };
    return { created, panel: store.panels[created ? store.panels.length - 1 : index] };
  });
}

export function removeStatusBot(userId) {
  return mutateStore((store) => {
    const index = store.bots.findIndex((item) => item.userId === userId);
    if (index === -1) return null;
    return store.bots.splice(index, 1)[0];
  });
}

export function updateStatusBotState(revision, online, stateChangedAt = Date.now()) {
  return mutateStore((store) => {
    const bot = store.bots.find((item) => item.revision === revision);
    if (!bot) return false;
    const previousObservedAt = Number.isFinite(bot.lastObservedAt) ? bot.lastObservedAt : bot.stateChangedAt;
    const elapsed = Math.max(0, stateChangedAt - previousObservedAt);
    bot.totalObservedMs = Math.max(0, (bot.totalObservedMs || 0) + elapsed);
    if (bot.lastOnline === true) bot.onlineObservedMs = Math.max(0, (bot.onlineObservedMs || 0) + elapsed);
    bot.lastObservedAt = stateChangedAt;
    bot.lastOnline = online;
    bot.stateChangedAt = stateChangedAt;
    return true;
  });
}
