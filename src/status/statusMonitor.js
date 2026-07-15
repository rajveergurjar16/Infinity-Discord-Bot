import { ContainerBuilder, TextDisplayBuilder } from 'discord.js';
import { cv2Flags } from '../ui/cv2.js';
import { listStatusBots, updateStatusBotState } from './statusRegistry.js';

const STATUS_TIMEOUT_MS = 900;
const STATUS_CHECK_INTERVAL_MS = 1_000;
const OFFLINE_FAILURES_REQUIRED = 3;
let monitorTimer;
let monitorRunning = false;
const consecutiveFailures = new Map();

export async function checkStatusEndpoint(bot) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);
  timeout.unref();

  try {
    const response = await fetch(bot.statusUrl, {
      headers: {
        Authorization: `Bearer ${bot.apiKey}`,
        Accept: 'application/json'
      },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) return false;
    const data = await response.json();
    return data?.status === 'online';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function safeName(name) {
  return name.replace(/([\\*_~`|>])/g, '\\$1');
}

function statusAlert(bot, online) {
  const state = online ? 'Online' : 'Offline';
  const message = online
    ? `**${safeName(bot.name)}** is back **Online**.`
    : `**${safeName(bot.name)}** is now **Offline**.`;
  return new ContainerBuilder()
    .setAccentColor(online ? 0x57f287 : 0xed4245)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${safeName(bot.name)} Status\n${message}`)
    );
}

async function notifyTransition(client, bot, online) {
  const channel = await client.channels.fetch(bot.channelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`Status log channel ${bot.channelId} is unavailable for ${bot.name}.`);
  }
  await channel.send({
    flags: cv2Flags,
    allowedMentions: { parse: [] },
    components: [statusAlert(bot, online)]
  });
}

async function checkBot(client, bot) {
  const online = await checkStatusEndpoint(bot);
  if (bot.lastOnline === null) {
    consecutiveFailures.delete(bot.revision);
    await updateStatusBotState(bot.revision, online);
    return;
  }

  if (online) {
    consecutiveFailures.delete(bot.revision);
    if (bot.lastOnline) return;
    await notifyTransition(client, bot, true);
    await updateStatusBotState(bot.revision, true);
    return;
  }

  if (!bot.lastOnline) {
    consecutiveFailures.delete(bot.revision);
    return;
  }

  const failures = Math.min(
    OFFLINE_FAILURES_REQUIRED,
    (consecutiveFailures.get(bot.revision) ?? 0) + 1
  );
  consecutiveFailures.set(bot.revision, failures);
  if (failures < OFFLINE_FAILURES_REQUIRED) return;

  await notifyTransition(client, bot, false);
  const updated = await updateStatusBotState(bot.revision, false);
  if (updated) consecutiveFailures.delete(bot.revision);
}

export async function checkStatusBotsNow(client) {
  if (monitorRunning) return;
  monitorRunning = true;
  try {
    const bots = await listStatusBots();
    const activeRevisions = new Set(bots.map((bot) => bot.revision));
    for (const revision of consecutiveFailures.keys()) {
      if (!activeRevisions.has(revision)) consecutiveFailures.delete(revision);
    }
    const results = await Promise.allSettled(bots.map((bot) => checkBot(client, bot)));
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Status monitor error for ${bots[index]?.name ?? 'unknown bot'}:`, result.reason);
      }
    });
  } finally {
    monitorRunning = false;
  }
}

export function startStatusMonitor(client) {
  if (monitorTimer) clearInterval(monitorTimer);
  void checkStatusBotsNow(client);
  monitorTimer = setInterval(() => { void checkStatusBotsNow(client); }, STATUS_CHECK_INTERVAL_MS);
  monitorTimer.unref();
}
