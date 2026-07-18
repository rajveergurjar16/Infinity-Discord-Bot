import { mutateStoreDocument, readStoreDocument } from '../database/storeRepository.js';

const STORE_KEY = 'subtag-settings';

const defaults = {
  adopt: {
    enabled: true,
    channelId: null,
    content: null,
    title: 'Server Tag Adopted',
    description: 'Thank you {user} for representing **{server}** with the **{tag}** tag!',
    color: '#00ff19',
    footer: 'Welcome to the tag family!',
    thumbnailUrl: '{avatar}',
    imageUrl: null
  },
  remove: {
    enabled: true,
    channelId: null,
    content: null,
    title: 'Server Tag Removed',
    description: '{user} removed the **{tag}** server tag from their profile.',
    color: '#ff0000',
    footer: null,
    thumbnailUrl: '{avatar}',
    imageUrl: null
  }
};
const defaultStore = { guilds: {} };

function normalizeTemplate(value, type) {
  const fallback = defaults[type];
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
    channelId: typeof value?.channelId === 'string' ? value.channelId : null,
    content: typeof value?.content === 'string' && value.content ? value.content : null,
    title: typeof value?.title === 'string' ? value.title : fallback.title,
    description: typeof value?.description === 'string' ? value.description : fallback.description,
    color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : fallback.color,
    footer: typeof value?.footer === 'string' && value.footer ? value.footer : null,
    thumbnailUrl: typeof value?.thumbnailUrl === 'string' && value.thumbnailUrl ? value.thumbnailUrl : null,
    imageUrl: typeof value?.imageUrl === 'string' && value.imageUrl ? value.imageUrl : null
  };
}

function normalizeStore(value) {
  const guilds = {};
  if (value?.guilds && typeof value.guilds === 'object') {
    for (const [guildId, settings] of Object.entries(value.guilds)) {
      if (!/^\d{17,20}$/.test(guildId)) continue;
      guilds[guildId] = {
        roleId: typeof settings?.roleId === 'string' ? settings.roleId : null,
        adopt: normalizeTemplate(settings?.adopt, 'adopt'),
        remove: normalizeTemplate(settings?.remove, 'remove')
      };
    }
  }
  return { guilds };
}

const readStore = () => readStoreDocument(STORE_KEY, defaultStore, normalizeStore);
const mutateStore = (updater) => mutateStoreDocument(STORE_KEY, defaultStore, normalizeStore, updater);

export async function getSubtagSettings(guildId) {
  const store = await readStore();
  const saved = store.guilds[guildId];
  return {
    roleId: typeof saved?.roleId === 'string' ? saved.roleId : null,
    adopt: normalizeTemplate(saved?.adopt, 'adopt'),
    remove: normalizeTemplate(saved?.remove, 'remove')
  };
}

export function saveSubtagTemplate(guildId, type, template, roleId = null) {
  return mutateStore((store) => {
    const current = store.guilds[guildId] || {
      roleId: null,
      adopt: normalizeTemplate(null, 'adopt'),
      remove: normalizeTemplate(null, 'remove')
    };
    current[type] = normalizeTemplate(template, type);
    current.roleId = typeof roleId === 'string' ? roleId : null;
    store.guilds[guildId] = current;
    return { template: current[type], roleId: current.roleId };
  });
}
