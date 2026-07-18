import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const settingsPath = path.resolve('data', 'ticket-settings.json');

const defaultSettings = {
  categoryId: null,
  logChannelId: null,
  panelChannelId: null,
  panelMessageId: null,
  deployedPanelChannelId: null,
  staffRoleIds: [],
  panelTitle: 'Support Tickets',
  panelDescription: 'Select the type of help you need from the menu below.',
  authorText: null,
  footerText: null,
  color: '#0055ff',
  authorIconUrl: null,
  bottomThumbnailUrl: null,
  thumbnailUrl: null,
  imageUrl: null,
  footerIconUrl: null,
  types: []
};

export async function getTicketSettings() {
  try {
    const raw = await readFile(settingsPath, 'utf8');
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaultSettings };
  }
}

export async function saveTicketSettings(settings) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}

export async function updateTicketSettings(patch) {
  const current = await getTicketSettings();
  return saveTicketSettings({ ...current, ...patch });
}

export function isTicketReady(settings) {
  return Boolean(
    settings.categoryId &&
    settings.logChannelId &&
    settings.panelChannelId &&
    settings.staffRoleIds.length &&
    settings.types.length
  );
}
