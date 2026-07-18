import {
  mutateStoreDocument,
  readStoreDocument,
  replaceStoreDocument
} from '../database/storeRepository.js';

const STORE_KEY = 'ticket-settings';

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

function normalizeSettings(value) {
  return {
    ...defaultSettings,
    ...(value && typeof value === 'object' ? value : {}),
    staffRoleIds: Array.isArray(value?.staffRoleIds) ? value.staffRoleIds : [],
    types: Array.isArray(value?.types) ? value.types : []
  };
}

export const getTicketSettings = () => readStoreDocument(STORE_KEY, defaultSettings, normalizeSettings);

export async function saveTicketSettings(settings) {
  return replaceStoreDocument(STORE_KEY, defaultSettings, normalizeSettings, settings);
}

export async function updateTicketSettings(patch) {
  return mutateStoreDocument(STORE_KEY, defaultSettings, normalizeSettings, (settings) => {
    Object.assign(settings, patch);
    return normalizeSettings(settings);
  });
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
