import { mutateStoreDocument, readStoreDocument } from '../database/storeRepository.js';

const STORE_KEY = 'invite-dashboard';
const defaults = { apps: [], panels: [] };

function normalizeStore(value) {
  const apps = Array.isArray(value?.apps) ? value.apps : [];
  const panels = Array.isArray(value?.panels) ? value.panels : [];
  return {
    apps: apps.filter((app) =>
      typeof app?.userId === 'string' &&
      typeof app?.name === 'string' &&
      typeof app?.permissions === 'string'
    ).map((app) => ({
      userId: app.userId,
      name: app.name,
      avatarUrl: typeof app.avatarUrl === 'string' ? app.avatarUrl : '',
      description: typeof app.description === 'string' ? app.description.trim().slice(0, 300) : '',
      permissions: app.permissions,
      addedBy: typeof app.addedBy === 'string' ? app.addedBy : '',
      updatedAt: Number.isFinite(app.updatedAt) ? app.updatedAt : Date.now()
    })),
    panels: panels.filter((panel) =>
      typeof panel?.guildId === 'string' &&
      typeof panel?.channelId === 'string' &&
      typeof panel?.messageId === 'string'
    ).map((panel) => ({
      guildId: panel.guildId,
      channelId: panel.channelId,
      messageId: panel.messageId,
      ownerId: typeof panel.ownerId === 'string' ? panel.ownerId : ''
    }))
  };
}

const readStore = () => readStoreDocument(STORE_KEY, defaults, normalizeStore);
const mutateStore = (updater) => mutateStoreDocument(STORE_KEY, defaults, normalizeStore, updater);

export async function getInviteStore() {
  return readStore();
}

export function upsertInviteApp(app) {
  return mutateStore((store) => {
    const index = store.apps.findIndex((item) => item.userId === app.userId);
    if (index === -1) store.apps.push(app);
    else store.apps[index] = app;
    return app;
  });
}

export function removeInviteApp(userId) {
  return mutateStore((store) => {
    const index = store.apps.findIndex((item) => item.userId === userId);
    if (index === -1) return null;
    const [removed] = store.apps.splice(index, 1);
    return removed;
  });
}

export function upsertInvitePanel(panel) {
  return mutateStore((store) => {
    const index = store.panels.findIndex((item) => item.guildId === panel.guildId);
    if (index === -1) store.panels.push(panel);
    else store.panels[index] = { ...store.panels[index], ...panel };
    return panel;
  });
}
