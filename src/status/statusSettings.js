import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const settingsPath = path.resolve('data', 'status-settings.json');

const defaultSettings = {
  panelChannelId: null,
  panelMessageId: null,
  title: 'Bot Status',
  description: 'Live status for our bots.',
  color: '#0055ff',
  refreshSeconds: 60,
  bots: [],
  onlineSince: {}
};

export async function getStatusSettings() {
  try {
    const raw = await readFile(settingsPath, 'utf8');
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaultSettings };
  }
}

export async function saveStatusSettings(settings) {
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  return settings;
}

export async function updateStatusSettings(patch) {
  const current = await getStatusSettings();
  return saveStatusSettings({ ...current, ...patch });
}

export function isStatusReady(settings) {
  return Boolean(settings.panelChannelId && settings.bots.length);
}
