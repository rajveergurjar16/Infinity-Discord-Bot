import {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import { cv2Flags } from '../ui/cv2.js';
import { listStatusBots, updateStatusBotState } from './statusRegistry.js';

const STATUS_TIMEOUT_MS = 900;
const STATUS_CHECK_INTERVAL_MS = 1_000;
const OFFLINE_FAILURES_REQUIRED = 5;
const ONLINE_EMOJI = '<a:online:1525532564352401478>';
const OFFLINE_EMOJI = '<a:offline:1525532809517600990>';
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

function formatDuration(milliseconds) {
  let seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(seconds / 86_400);
  seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600);
  seconds %= 3_600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;
  return [
    days ? `${days}d` : '',
    hours ? `${hours}h` : '',
    minutes ? `${minutes}m` : '',
    `${seconds}s`
  ].filter(Boolean).join(' ');
}

function statusAlert(bot, online, transitionAt) {
  const state = online ? 'online' : 'offline';
  const previousState = online ? 'offline' : 'online';
  const duration = formatDuration(transitionAt - bot.stateChangedAt);
  const headerText = new TextDisplayBuilder().setContent(
    `### ${online ? ONLINE_EMOJI : OFFLINE_EMOJI} ${safeName(bot.name)} is ${state}`
  );
  const container = new ContainerBuilder().setAccentColor(online ? 0x00FF19 : 0xff0000);
  if (bot.avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(headerText)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(bot.avatarUrl))
    );
  } else {
    container.addTextDisplayComponents(headerText);
  }
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `Was ${previousState} for **${duration}**`
    ));

  if (bot.pingText) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bot.pingText));
  }
  return container;
}

function allowedMentions(pingText) {
  const users = [...pingText.matchAll(/<@!?([1-9]\d{16,19})>/g)].map((match) => match[1]);
  const roles = [...pingText.matchAll(/<@&([1-9]\d{16,19})>/g)].map((match) => match[1]);
  const parse = /@(everyone|here)\b/i.test(pingText) ? ['everyone'] : [];
  return { parse, users: [...new Set(users)], roles: [...new Set(roles)], repliedUser: false };
}

async function notifyTransition(client, bot, online, transitionAt) {
  const channel = await client.channels.fetch(bot.channelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error(`Status log channel ${bot.channelId} is unavailable for ${bot.name}.`);
  }
  await channel.send({
    flags: cv2Flags,
    allowedMentions: allowedMentions(bot.pingText),
    components: [statusAlert(bot, online, transitionAt)]
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
    const transitionAt = Date.now();
    await notifyTransition(client, bot, true, transitionAt);
    await updateStatusBotState(bot.revision, true, transitionAt);
    return;
  }

  if (!bot.lastOnline) {
    consecutiveFailures.delete(bot.revision);
    return;
  }

  const previousFailure = consecutiveFailures.get(bot.revision);
  const failure = {
    count: Math.min(OFFLINE_FAILURES_REQUIRED, (previousFailure?.count ?? 0) + 1),
    firstFailedAt: previousFailure?.firstFailedAt ?? Date.now()
  };
  consecutiveFailures.set(bot.revision, failure);
  if (failure.count < OFFLINE_FAILURES_REQUIRED) return;

  const transitionAt = failure.firstFailedAt;
  await notifyTransition(client, bot, false, transitionAt);
  const updated = await updateStatusBotState(bot.revision, false, transitionAt);
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
