import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import { cv2Flags, privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import {
  listStatusBots,
  listStatusPanels,
  updateStatusBotState,
  upsertStatusPanel
} from './statusRegistry.js';

const STATUS_TIMEOUT_MS = 900;
const STATUS_CHECK_INTERVAL_MS = 1_000;
const STATUS_PANEL_REFRESH_MS = 30_000;
const OFFLINE_FAILURES_REQUIRED = 5;
const ONLINE_EMOJI = '<a:online:1525532564352401478>';
const OFFLINE_EMOJI = '<a:offline:1525532809517600990>';
const DELETE_EMOJI = '<:bin:1527374402109309089>';
const STATUS_ALERT_DELETE_PREFIX = 'status_alert_delete:';
const STATUS_PANEL_SELECT_ID = 'status_panel:history';
let monitorTimer;
let panelTimer;
let monitorRunning = false;
let panelRunning = false;
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

function uptimePercent(bot, now = Date.now()) {
  const lastObservedAt = Number.isFinite(bot.lastObservedAt) ? bot.lastObservedAt : bot.stateChangedAt;
  const elapsed = Math.max(0, now - lastObservedAt);
  const total = Math.max(0, (bot.totalObservedMs || 0) + elapsed);
  const online = Math.max(0, (bot.onlineObservedMs || 0) + (bot.lastOnline ? elapsed : 0));
  if (!total) return bot.lastOnline ? '100.00' : '0.00';
  return Math.min(100, Math.max(0, (online / total) * 100)).toFixed(2);
}

function statusAlert(bot, online, transitionAt) {
  const state = online ? 'online' : 'offline';
  const previousState = online ? 'offline' : 'online';
  const duration = formatDuration(transitionAt - bot.stateChangedAt);
  const headerText = new TextDisplayBuilder().setContent(
    `### ${online ? ONLINE_EMOJI : OFFLINE_EMOJI} ${safeName(bot.name)} is ${state}`
  );
  const durationText = new TextDisplayBuilder().setContent(
    `Was ${previousState} for **${duration}**`
  );
  const statusText = [headerText, durationText];
  if (bot.pingText) {
    statusText.push(new TextDisplayBuilder().setContent(bot.pingText));
  }
  const container = new ContainerBuilder().setAccentColor(online ? 0x00FF19 : 0xff0000);
  if (bot.avatarUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(...statusText)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(bot.avatarUrl))
    );
  } else {
    container.addTextDisplayComponents(...statusText);
  }
  return container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${STATUS_ALERT_DELETE_PREFIX}${bot.userId}`)
        .setEmoji(DELETE_EMOJI)
        .setStyle(ButtonStyle.Secondary)
    )
  );
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

function statusPanelPayload(bots) {
  const sortedBots = [...bots].sort((a, b) => a.name.localeCompare(b.name));
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Bot Status Dashboard'))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

  if (!sortedBots.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No bots are being monitored yet.'));
  }

  for (const bot of sortedBots.slice(0, 24)) {
    const online = bot.lastOnline === true;
    const stateText = bot.lastOnline === null ? 'Unknown' : online ? 'Online' : 'Offline';
    const duration = formatDuration(Date.now() - bot.stateChangedAt);
    const lines = [
      `### ${online ? ONLINE_EMOJI : OFFLINE_EMOJI} ${safeName(bot.name)}`,
      `**Status:** ${stateText}${bot.lastOnline === null ? '' : ` for ${duration}`}`,
      `**Uptime:** ${uptimePercent(bot)}%`
    ];
    const section = new SectionBuilder().addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n'))
    );
    if (bot.avatarUrl) section.setThumbnailAccessory(new ThumbnailBuilder().setURL(bot.avatarUrl));
    container
      .addSectionComponents(section)
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Last Updated: <t:${Math.floor(Date.now() / 1000)}:f>`)
  );

  if (sortedBots.length) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(STATUS_PANEL_SELECT_ID)
          .setPlaceholder('Select a bot to view session history')
          .addOptions(sortedBots.slice(0, 25).map((bot) => ({
            label: bot.name.slice(0, 100),
            description: `${bot.lastOnline ? 'Online' : 'Offline'} - uptime ${uptimePercent(bot)}%`.slice(0, 100),
            value: bot.userId
          })))
      )
    );
  }

  return { flags: cv2Flags, components: [container] };
}

async function updateStatusPanel(client, panel, bots) {
  const channel = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel?.isTextBased()) return false;
  const payload = statusPanelPayload(bots);
  let message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (!message) {
    message = await channel.send(payload);
    await upsertStatusPanel({ ...panel, messageId: message.id });
    return true;
  }
  await message.edit(payload);
  return true;
}

export async function refreshStatusPanels(client) {
  if (panelRunning) return;
  panelRunning = true;
  try {
    const [bots, panels] = await Promise.all([listStatusBots(), listStatusPanels()]);
    await Promise.allSettled(panels.map((panel) => updateStatusPanel(client, panel, bots)));
  } finally {
    panelRunning = false;
  }
}

export async function configureStatusPanel(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!channel?.isTextBased()) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid Channel', 'Choose a text channel for the status dashboard.')]
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const existingPanel = (await listStatusPanels()).find((panel) => panel.guildId === interaction.guildId);
  const bots = await listStatusBots();
  const message = await channel.send(statusPanelPayload(bots));
  if (existingPanel?.messageId && existingPanel.messageId !== message.id) {
    const oldChannel = await interaction.client.channels.fetch(existingPanel.channelId).catch(() => null);
    const oldMessage = oldChannel?.isTextBased()
      ? await oldChannel.messages.fetch(existingPanel.messageId).catch(() => null)
      : null;
    await oldMessage?.delete().catch(() => {});
  }
  await upsertStatusPanel({
    guildId: interaction.guildId,
    channelId: channel.id,
    messageId: message.id,
    ownerId: interaction.user.id,
    createdAt: Date.now()
  });
  await interaction.editReply({
    flags: cv2Flags,
    components: [simpleContainer('Status Panel Ready', `Combined status dashboard will refresh in ${channel} every 30 seconds.`)]
  });
}

export async function handleStatusInteraction(interaction) {
  if (interaction.isButton() && interaction.customId.startsWith(STATUS_ALERT_DELETE_PREFIX)) {
    const bots = await listStatusBots();
    const userId = interaction.customId.slice(STATUS_ALERT_DELETE_PREFIX.length);
    const bot = bots.find((item) => item.userId === userId);
    const canDelete = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) || bot?.ownerId === interaction.user.id;
    if (!canDelete) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Cannot Delete', 'Only a server manager or the status log creator can delete this alert.')]
      });
      return true;
    }
    await interaction.deferUpdate().catch(() => {});
    await interaction.message.delete().catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === STATUS_PANEL_SELECT_ID) {
    const bots = await listStatusBots();
    const bot = bots.find((item) => item.userId === interaction.values[0]);
    if (!bot) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Not Found', 'That bot is no longer being monitored.')]
      });
      return true;
    }
    const online = bot.lastOnline === true;
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer(
        `${bot.name} Session`,
        `Status: **${online ? 'Online' : 'Offline'}** for **${formatDuration(Date.now() - bot.stateChangedAt)}**\nUptime: **${uptimePercent(bot)}%**`
      )]
    });
    return true;
  }

  return false;
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
  if (panelTimer) clearInterval(panelTimer);
  void checkStatusBotsNow(client);
  void refreshStatusPanels(client);
  monitorTimer = setInterval(() => { void checkStatusBotsNow(client); }, STATUS_CHECK_INTERVAL_MS);
  monitorTimer.unref();
  panelTimer = setInterval(() => { void refreshStatusPanels(client); }, STATUS_PANEL_REFRESH_MS);
  panelTimer.unref();
}
