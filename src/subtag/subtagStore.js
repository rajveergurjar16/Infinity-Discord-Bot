import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const storePath = path.resolve('data', 'subtag-settings.json');
const temporaryPath = `${storePath}.tmp`;
let mutationQueue = Promise.resolve();

const defaults = {
  adopt: {
    enabled: true,
    channelId: null,
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
    title: 'Server Tag Removed',
    description: '{user} removed the **{tag}** server tag from their profile.',
    color: '#ff0000',
    footer: null,
    thumbnailUrl: '{avatar}',
    imageUrl: null
  }
};

function normalizeTemplate(value, type) {
  const fallback = defaults[type];
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : fallback.enabled,
    channelId: typeof value?.channelId === 'string' ? value.channelId : null,
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
        adopt: normalizeTemplate(settings?.adopt, 'adopt'),
        remove: normalizeTemplate(settings?.remove, 'remove')
      };
    }
  }
  return { guilds };
}

async function readStore() {
  try {
    return normalizeStore(JSON.parse(await readFile(storePath, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return { guilds: {} };
    throw error;
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(storePath), { recursive: true });
  await writeFile(temporaryPath, JSON.stringify(normalizeStore(store), null, 2), {
    encoding: 'utf8',
    mode: 0o600
  });
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, storePath);
}

function mutateStore(updater) {
  const operation = mutationQueue.then(async () => {
    const store = await readStore();
    const result = await updater(store);
    await writeStore(store);
    return result;
  });
  mutationQueue = operation.catch(() => undefined);
  return operation;
}

export async function getSubtagSettings(guildId) {
  await mutationQueue;
  const store = await readStore();
  const saved = store.guilds[guildId];
  return {
    adopt: normalizeTemplate(saved?.adopt, 'adopt'),
    remove: normalizeTemplate(saved?.remove, 'remove')
  };
}

export function saveSubtagTemplate(guildId, type, template) {
  return mutateStore((store) => {
    const current = store.guilds[guildId] || {
      adopt: normalizeTemplate(null, 'adopt'),
      remove: normalizeTemplate(null, 'remove')
    };
    current[type] = normalizeTemplate(template, type);
    store.guilds[guildId] = current;
    return current[type];
  });
}
