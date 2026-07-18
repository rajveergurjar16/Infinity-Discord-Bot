import { normalizeRepeat } from './reminderTime.js';
import { mutateStoreDocument, readStoreDocument } from '../database/storeRepository.js';

const STORE_KEY = 'reminders';
const defaults = { reminders: [], panels: [] };

function normalizeReminder(reminder) {
  if (
    typeof reminder?.id !== 'string' ||
    typeof reminder?.guildId !== 'string' ||
    typeof reminder?.channelId !== 'string' ||
    typeof reminder?.title !== 'string' ||
    !Number.isFinite(reminder?.dueAt)
  ) return null;

  return {
    id: reminder.id,
    guildId: reminder.guildId,
    channelId: reminder.channelId,
    title: reminder.title,
    details: typeof reminder.details === 'string' ? reminder.details : '',
    pingText: typeof reminder.pingText === 'string' ? reminder.pingText : '',
    repeat: normalizeRepeat(reminder.repeat) || 'once',
    priority: ['normal', 'important', 'critical'].includes(reminder.priority) ? reminder.priority : 'normal',
    dueAt: reminder.dueAt,
    occurrenceAt: Number.isFinite(reminder.occurrenceAt) ? reminder.occurrenceAt : reminder.dueAt,
    status: ['scheduled', 'awaiting', 'completed', 'cancelled'].includes(reminder.status)
      ? reminder.status
      : 'scheduled',
    createdBy: typeof reminder.createdBy === 'string' ? reminder.createdBy : '',
    createdAt: Number.isFinite(reminder.createdAt) ? reminder.createdAt : Date.now(),
    activeMessageId: typeof reminder.activeMessageId === 'string' ? reminder.activeMessageId : null,
    deliveredAt: Number.isFinite(reminder.deliveredAt) ? reminder.deliveredAt : null,
    escalationCount: Number.isInteger(reminder.escalationCount) ? reminder.escalationCount : 0,
    lastEscalatedAt: Number.isFinite(reminder.lastEscalatedAt) ? reminder.lastEscalatedAt : null,
    completedAt: Number.isFinite(reminder.completedAt) ? reminder.completedAt : null,
    completedBy: typeof reminder.completedBy === 'string' ? reminder.completedBy : null,
    cancelledAt: Number.isFinite(reminder.cancelledAt) ? reminder.cancelledAt : null,
    cancelledBy: typeof reminder.cancelledBy === 'string' ? reminder.cancelledBy : null
  };
}

function normalizeStore(value) {
  const reminders = Array.isArray(value?.reminders)
    ? value.reminders.map(normalizeReminder).filter(Boolean)
    : [];
  const panels = Array.isArray(value?.panels) ? value.panels.filter((panel) =>
    typeof panel?.guildId === 'string' &&
    typeof panel?.channelId === 'string' &&
    typeof panel?.messageId === 'string'
  ).map((panel) => ({
    guildId: panel.guildId,
    channelId: panel.channelId,
    messageId: panel.messageId,
    ownerId: typeof panel.ownerId === 'string' ? panel.ownerId : ''
  })) : [];
  return { reminders, panels };
}

const readStore = () => readStoreDocument(STORE_KEY, defaults, normalizeStore);
const mutateStore = (updater) => mutateStoreDocument(STORE_KEY, defaults, normalizeStore, updater);

export async function getReminderStore() {
  return readStore();
}

export function addReminder(reminder) {
  return mutateStore((store) => {
    store.reminders.push(reminder);
    return reminder;
  });
}

export function updateReminder(id, updater) {
  return mutateStore((store) => {
    const index = store.reminders.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const patch = typeof updater === 'function' ? updater({ ...store.reminders[index] }) : updater;
    store.reminders[index] = { ...store.reminders[index], ...patch };
    return store.reminders[index];
  });
}

export function upsertReminderPanel(panel) {
  return mutateStore((store) => {
    const index = store.panels.findIndex((item) => item.guildId === panel.guildId);
    if (index === -1) store.panels.push(panel);
    else store.panels[index] = { ...store.panels[index], ...panel };
    return panel;
  });
}
