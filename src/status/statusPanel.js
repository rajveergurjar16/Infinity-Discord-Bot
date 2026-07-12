import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder
} from 'discord.js';
import {
  getStatusSettings,
  isStatusReady,
  saveStatusSettings,
  updateStatusSettings
} from './statusSettings.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

const ONLINE_EMOJI = '<a:online:1525532564352401478>';
const OFFLINE_EMOJI = '<a:offline:1525532809517600990>';
const STATUS_TIMEOUT_MS = 5000;

let refreshTimer = null;

function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

function separator() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

function parseEmoji(emoji) {
  if (!emoji) return undefined;
  const custom = emoji.match(/^<(?<animated>a?):(?<name>[a-zA-Z0-9_]+):(?<id>\d+)>$/);
  if (custom?.groups) {
    return {
      name: custom.groups.name,
      id: custom.groups.id,
      animated: custom.groups.animated === 'a'
    };
  }
  return emoji;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'Unknown';

  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (!parts.length) parts.push(`${seconds}s`);
  return parts.join(' ');
}

function normalizeDate(value) {
  if (!value) return null;
  const date = typeof value === 'number' ? new Date(value) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchHealth(bot) {
  if (!bot.statusUrl) {
    return {
      online: false,
      onlineSince: null,
      uptime: null,
      iconUrl: bot.iconUrl || null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

  try {
    const response = await fetch(bot.statusUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return { online: false, onlineSince: null, uptime: null, iconUrl: bot.iconUrl || null };
    }

    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('application/json') ? await response.json() : {};

    return {
      online: data.online ?? true,
      onlineSince: normalizeDate(data.onlineSince ?? data.startedAt ?? data.uptimeStartedAt),
      uptime: data.uptime ?? data.uptimePercent ?? null,
      iconUrl: data.iconUrl ?? bot.iconUrl ?? null
    };
  } catch {
    return { online: false, onlineSince: null, uptime: null, iconUrl: bot.iconUrl || null };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveBot(bot, settings) {
  const health = await fetchHealth(bot);
  const trackedOnlineSince = settings.onlineSince?.[bot.id] ? new Date(settings.onlineSince[bot.id]) : null;
  const onlineSince = health.online ? health.onlineSince ?? trackedOnlineSince ?? new Date() : null;

  return {
    ...bot,
    ...health,
    onlineSince
  };
}

async function resolveBots(settings) {
  const resolved = await Promise.all(settings.bots.map((bot) => resolveBot(bot, settings)));
  const nextOnlineSince = { ...(settings.onlineSince ?? {}) };
  let changed = false;

  for (const bot of resolved) {
    if (bot.online && bot.onlineSince) {
      const iso = bot.onlineSince.toISOString();
      if (nextOnlineSince[bot.id] !== iso) {
        nextOnlineSince[bot.id] = iso;
        changed = true;
      }
    }

    if (!bot.online && nextOnlineSince[bot.id]) {
      delete nextOnlineSince[bot.id];
      changed = true;
    }
  }

  if (changed) {
    await saveStatusSettings({ ...settings, onlineSince: nextOnlineSince });
  }

  return resolved;
}

function botLine(bot) {
  const statusText = bot.online
    ? `Online for ${formatDuration(Date.now() - bot.onlineSince.getTime())}`
    : 'Offline';
  const uptimeLine = bot.uptime ? `\n**Uptime:** ${bot.uptime}` : '';

  return [
    `## ${bot.online ? ONLINE_EMOJI : OFFLINE_EMOJI} ${bot.name}`,
    `**Status:** ${statusText}`,
    `**Online Since:** ${bot.onlineSince ? `<t:${Math.floor(bot.onlineSince.getTime() / 1000)}:F>` : 'Offline'}`,
    uptimeLine.trim()
  ].filter(Boolean).join('\n');
}

export async function buildStatusPanel(settings) {
  const bots = await resolveBots(settings);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      text(`# ${settings.title}\n${settings.description}`)
    )
    .addSeparatorComponents(separator());

  if (!bots.length) {
    container.addTextDisplayComponents(text('No bots added yet.'));
    return container;
  }

  for (const [index, bot] of bots.entries()) {
    if (bot.iconUrl) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(text(botLine(bot)))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(bot.iconUrl))
      );
    } else {
      container.addTextDisplayComponents(text(botLine(bot)));
    }

    if (index !== bots.length - 1) {
      container.addSeparatorComponents(separator());
    }
  }

  return container;
}

function buildStatusComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('status:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildStatusEditorComponents(settings) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('status_editor:action')
        .setPlaceholder('Open status editor')
        .addOptions([
          {
            label: 'Edit Text & Refresh',
            description: 'Title, description, auto-refresh interval.',
            value: 'text'
          },
          {
            label: 'Add Bot',
            description: 'Add name, status API URL, and icon URL.',
            value: 'add_bot'
          },
          {
            label: 'Remove Bot',
            description: 'Remove a bot from the status panel.',
            value: 'remove_bot'
          },
          {
            label: 'Select Panel Channel',
            description: 'Choose where the status panel is sent.',
            value: 'panel_channel'
          },
          {
            label: 'Set Channel ID Manually',
            description: 'Use ID if the selector does not show a channel.',
            value: 'manual_channel'
          }
        ])
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('status_editor:send')
        .setLabel(settings.panelMessageId ? 'Update Panel' : 'Send Panel')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('status_editor:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export async function openStatusEditor(interaction) {
  const settings = await getStatusSettings();

  await interaction.reply({
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    components: [
      await buildStatusPanel(settings),
      ...buildStatusEditorComponents(settings)
    ]
  });
}

export async function handleStatusEditorAction(interaction) {
  const action = interaction.values[0];
  const settings = await getStatusSettings();

  if (action === 'text') {
    await showTextModal(interaction, settings);
    return;
  }

  if (action === 'add_bot') {
    await showAddBotModal(interaction);
    return;
  }

  if (action === 'remove_bot') {
    await showRemoveBotSelector(interaction, settings);
    return;
  }

  if (action === 'panel_channel') {
    await interaction.update({
      flags: MessageFlags.IsComponentsV2,
      components: [
        new ContainerBuilder().addTextDisplayComponents(
          text('Select the channel where the bot status panel should be sent. If it is not visible, type its name to search.')
        ),
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('status_editor_select:panel_channel')
            .setPlaceholder('Select status panel channel')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    });
    return;
  }

  if (action === 'manual_channel') {
    await showManualChannelModal(interaction, settings);
  }
}

function addModalText(modal, id, label, value, style = TextInputStyle.Short, required = false) {
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(required)
        .setValue(value || '')
    )
  );
}

async function showTextModal(interaction, settings) {
  const modal = new ModalBuilder()
    .setCustomId('status_editor_modal:text')
    .setTitle('Edit Status Panel');

  addModalText(modal, 'title', 'Title', settings.title, TextInputStyle.Short, true);
  addModalText(modal, 'description', 'Description', settings.description, TextInputStyle.Paragraph, true);
  addModalText(modal, 'refreshSeconds', 'Auto Refresh Seconds (30-3600)', String(settings.refreshSeconds));

  await interaction.showModal(modal);
}

async function showAddBotModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('status_editor_modal:add_bot')
    .setTitle('Add Bot Status');

  addModalText(modal, 'name', 'Display Name', '', TextInputStyle.Short, true);
  addModalText(modal, 'statusUrl', 'Status API URL', '', TextInputStyle.Short, true);
  addModalText(modal, 'iconUrl', 'Icon Image URL', '');
  addModalText(modal, 'id', 'Stable Bot Key / ID', '');

  await interaction.showModal(modal);
}

async function showManualChannelModal(interaction, settings) {
  const modal = new ModalBuilder()
    .setCustomId('status_editor_modal:manual_channel')
    .setTitle('Set Status Channel ID');

  addModalText(modal, 'panelChannelId', 'Panel Channel ID', settings.panelChannelId);

  await interaction.showModal(modal);
}

async function showRemoveBotSelector(interaction, settings) {
  if (!settings.bots.length) {
    await updateStatusEditor(interaction, settings);
    await interaction.followUp({
      flags: privateCv2Flags,
      components: [simpleContainer('No Bots Added', 'There are no bots to remove.')]
    });
    return;
  }

  await interaction.update({
    flags: MessageFlags.IsComponentsV2,
    components: [
      new ContainerBuilder().addTextDisplayComponents(text('Select the bot you want to remove.')),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('status_editor_select:remove_bot')
          .setPlaceholder('Remove bot')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            settings.bots.slice(0, 25).map((bot) => ({
              label: bot.name,
              description: bot.statusUrl?.slice(0, 100) || bot.id,
              value: bot.id,
              emoji: parseEmoji(bot.emoji)
            }))
          )
      )
    ]
  });
}

export async function handleStatusEditorModal(interaction) {
  const modal = interaction.customId.split(':')[1];
  const settings = await getStatusSettings();

  if (modal === 'text') {
    const refreshSeconds = Number(interaction.fields.getTextInputValue('refreshSeconds'));
    const next = await updateStatusSettings({
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      refreshSeconds: Number.isFinite(refreshSeconds)
        ? Math.min(3600, Math.max(30, Math.floor(refreshSeconds)))
        : settings.refreshSeconds
    });

    await refreshExistingPanel(interaction.client).catch(() => {});
    startStatusAutoRefresh(interaction.client);
    await updateStatusEditor(interaction, next);
    return;
  }

  if (modal === 'add_bot') {
    const name = interaction.fields.getTextInputValue('name').trim();
    const statusUrl = interaction.fields.getTextInputValue('statusUrl').trim();
    const id = interaction.fields.getTextInputValue('id').trim() || statusUrl;
    const bot = {
      id,
      name,
      statusUrl,
      iconUrl: interaction.fields.getTextInputValue('iconUrl').trim() || null
    };

    const nextBots = settings.bots.filter((item) => item.id !== id);
    nextBots.push(bot);

    const next = await saveStatusSettings({ ...settings, bots: nextBots });
    await refreshExistingPanel(interaction.client).catch(() => {});
    await updateStatusEditor(interaction, next);
    return;
  }

  if (modal === 'manual_channel') {
    const next = await updateStatusSettings({
      panelChannelId: interaction.fields.getTextInputValue('panelChannelId').trim() || null
    });

    await updateStatusEditor(interaction, next);
  }
}

export async function handleStatusEditorSelect(interaction) {
  const action = interaction.customId.split(':')[1];

  if (action === 'panel_channel') {
    const next = await updateStatusSettings({ panelChannelId: interaction.values[0] });
    await updateStatusEditor(interaction, next);
    return true;
  }

  if (action === 'remove_bot') {
    const settings = await getStatusSettings();
    const next = await saveStatusSettings({
      ...settings,
      bots: settings.bots.filter((bot) => bot.id !== interaction.values[0])
    });

    await refreshExistingPanel(interaction.client).catch(() => {});
    await updateStatusEditor(interaction, next);
    return true;
  }

  return false;
}

async function updateStatusEditor(interaction, settings) {
  await interaction.update({
    flags: MessageFlags.IsComponentsV2,
    components: [
      await buildStatusPanel(settings),
      ...buildStatusEditorComponents(settings)
    ]
  });
}

export async function sendStatusPanel(interaction) {
  const settings = await getStatusSettings();

  if (!isStatusReady(settings)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Setup Incomplete', 'Select panel channel and add at least one bot first.')]
    });
    return;
  }

  const channel = await interaction.guild.channels.fetch(settings.panelChannelId);
  const payload = {
    flags: MessageFlags.IsComponentsV2,
    components: [
      await buildStatusPanel(settings),
      ...buildStatusComponents()
    ]
  };

  let message = null;
  if (settings.panelMessageId) {
    message = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
  }

  if (message?.embeds.length || message?.content) {
    await message.delete().catch(() => {});
    message = null;
  }

  if (message) {
    await message.edit(payload);
  } else {
    message = await channel.send(payload);
  }

  const next = await updateStatusSettings({
    panelChannelId: channel.id,
    panelMessageId: message.id
  });

  startStatusAutoRefresh(interaction.client);
  await updateStatusEditor(interaction, next);
  await interaction.followUp({
    flags: privateCv2Flags,
    components: [simpleContainer('Status Panel Saved', `Status panel is live in ${channel}.`)]
  });
}

export async function refreshStatusPanelButton(interaction) {
  const settings = await getStatusSettings();
  await interaction.update({
    flags: MessageFlags.IsComponentsV2,
    components: [
      await buildStatusPanel(settings),
      ...buildStatusComponents()
    ]
  });
}

export async function cancelStatusEditor(interaction) {
  await interaction.update({
    components: [],
    content: 'Status panel editor cancelled.'
  });
}

export function startStatusAutoRefresh(client) {
  if (refreshTimer) clearInterval(refreshTimer);

  getStatusSettings()
    .then((settings) => {
      if (!settings.panelChannelId || !settings.panelMessageId || !settings.bots.length) return;

      const intervalMs = Math.max(30, settings.refreshSeconds) * 1000;
      refreshTimer = setInterval(() => {
        refreshExistingPanel(client).catch((error) => {
          console.error('Status auto-refresh error:', error);
        });
      }, intervalMs);
    })
    .catch((error) => {
      console.error('Status auto-refresh setup error:', error);
    });
}

async function refreshExistingPanel(client) {
  const settings = await getStatusSettings();
  if (!settings.panelChannelId || !settings.panelMessageId) return;

  const channel = await client.channels.fetch(settings.panelChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  let message = await channel.messages.fetch(settings.panelMessageId).catch(() => null);
  if (!message) return;

  if (message.embeds.length || message.content) {
    await message.delete().catch(() => {});
    message = await channel.send({
      flags: MessageFlags.IsComponentsV2,
      components: [
        await buildStatusPanel(settings),
        ...buildStatusComponents()
      ]
    });
    await updateStatusSettings({ panelMessageId: message.id });
    return;
  }

  await message.edit({
    flags: MessageFlags.IsComponentsV2,
    components: [
      await buildStatusPanel(settings),
      ...buildStatusComponents()
    ]
  });
}
