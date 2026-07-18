import { randomUUID } from 'node:crypto';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { cv2Flags, privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import {
  addReminder,
  getReminderStore,
  updateReminder,
  upsertReminderPanel
} from './reminderStore.js';
import {
  formatEditableIst,
  formatInputHint,
  formatPriority,
  formatRepeat,
  formatRepeatHint,
  nextFutureRepeatAt,
  normalizeRepeat,
  parseReminderTime
} from './reminderTime.js';

const CHECK_INTERVAL_MS = 5_000;
const PANEL_INTERVAL_MS = 30_000;
const PENDING_TTL_MS = 15 * 60_000;
const pendingReminders = new Map();
let schedulerTimer;
let panelTimer;
let schedulerRunning = false;
let panelRunning = false;

function isAdmin(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true;
}

function allowedMentions(pingText) {
  const users = [...String(pingText).matchAll(/<@!?([1-9]\d{16,19})>/g)].map((match) => match[1]);
  const roles = [...String(pingText).matchAll(/<@&([1-9]\d{16,19})>/g)].map((match) => match[1]);
  const parse = /@(everyone|here)\b/i.test(pingText) ? ['everyone'] : [];
  return { parse, users: [...new Set(users)], roles: [...new Set(roles)], repliedUser: false };
}

function reminderId() {
  return `rem-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
}

function previewPayload(token, reminder) {
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## Confirm Reminder',
      `### ${reminder.title}`,
      reminder.details || '*No additional details.*',
      '',
      `**When:** <t:${Math.floor(reminder.dueAt / 1000)}:F> (<t:${Math.floor(reminder.dueAt / 1000)}:R>)`,
      `**Channel:** <#${reminder.channelId}>`,
      `**Ping:** ${reminder.pingText || 'None'}`,
      `**Repeat:** ${formatRepeat(reminder.repeat)}`,
      `**Priority:** ${formatPriority(reminder.priority)}`,
      '-# Absolute dates are interpreted in Indian Standard Time.'
    ].join('\n')))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reminder_preview:confirm:${token}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reminder_preview:edit:${token}`)
          .setLabel('Edit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`reminder_preview:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      )
    );
  return { flags: privateCv2Flags, components: [container] };
}

function priorityColor(priority) {
  if (priority === 'critical') return 0xff0000;
  if (priority === 'important') return 0xffa500;
  return 0x5865f2;
}

function alertPayload(reminder) {
  const dueUnix = Math.floor(reminder.occurrenceAt / 1000);
  const container = new ContainerBuilder()
    .setAccentColor(priorityColor(reminder.priority))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      `## ${formatPriority(reminder.priority)} Reminder`,
      `### ${reminder.title}`,
      reminder.details || '*No additional details.*',
      '',
      `**Scheduled for:** <t:${dueUnix}:F>`,
      `**Repeat:** ${formatRepeat(reminder.repeat)}`,
      `**Created by:** <@${reminder.createdBy}>`,
      reminder.pingText || ''
    ].filter(Boolean).join('\n')))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reminder_action:done:${reminder.id}`)
          .setLabel('Mark Done')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reminder_action:snooze10:${reminder.id}`)
          .setLabel('Snooze 10m')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`reminder_action:snooze60:${reminder.id}`)
          .setLabel('Snooze 1h')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`reminder_action:tomorrow:${reminder.id}`)
          .setLabel('Tomorrow')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`reminder_action:cancel:${reminder.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
      )
    );
  return {
    flags: cv2Flags,
    allowedMentions: allowedMentions(reminder.pingText),
    components: [container]
  };
}

function finalAlertPayload(reminder, state, actorId, extra = '') {
  const color = state === 'Completed' ? 0x00ff19 : state === 'Snoozed' ? 0xffa500 : 0xff0000;
  return {
    components: [new ContainerBuilder()
      .setAccentColor(color)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([
        `## Reminder ${state}`,
        `### ${reminder.title}`,
        extra,
        `Updated by: <@${actorId}>`
      ].filter(Boolean).join('\n')))]
  };
}

function reminderDetails(reminder) {
  return [
    `### ${reminder.title}`,
    reminder.details || '*No additional details.*',
    `**ID:** \`${reminder.id}\``,
    `**Status:** ${reminder.status}`,
    `**Due:** <t:${Math.floor(reminder.dueAt / 1000)}:F> (<t:${Math.floor(reminder.dueAt / 1000)}:R>)`,
    `**Channel:** <#${reminder.channelId}>`,
    `**Ping:** ${reminder.pingText || 'None'}`,
    `**Priority:** ${formatPriority(reminder.priority)}`,
    `**Repeat:** ${formatRepeat(reminder.repeat)}`
  ].join('\n');
}

function dashboardPayload(reminders) {
  const active = reminders.filter((item) => ['scheduled', 'awaiting'].includes(item.status));
  const now = Date.now();
  const overdue = active.filter((item) => item.dueAt < now).length;
  const todayEnd = now + 86_400_000;
  const dueSoon = active.filter((item) => item.dueAt >= now && item.dueAt <= todayEnd).length;
  const upcoming = [...active].sort((a, b) => a.dueAt - b.dueAt);
  const completedToday = reminders.filter((item) => item.completedAt >= now - 86_400_000).length;

  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## Reminder Dashboard',
      `**Overdue:** ${overdue}`,
      `**Due in 24 hours:** ${dueSoon}`,
      `**Active:** ${active.length}`,
      `**Completed in 24 hours:** ${completedToday}`
    ].join('\n')))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );

  if (!upcoming.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No active reminders.'));
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
      upcoming.slice(0, 10).map((item) =>
        `- **${item.title}** — <t:${Math.floor(item.dueAt / 1000)}:R> — ${formatPriority(item.priority)}`
      ).join('\n')
    ));
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('reminder_panel:details')
          .setPlaceholder('View a reminder')
          .addOptions(upcoming.slice(0, 25).map((item) => ({
            label: item.title.slice(0, 100),
            description: `${formatPriority(item.priority)} - ${item.status}`.slice(0, 100),
            value: item.id
          })))
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  ).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Last Updated: <t:${Math.floor(now / 1000)}:f>`)
  );
  return { flags: cv2Flags, components: [container] };
}

export async function createReminderPreview(interaction) {
  const dueAt = parseReminderTime(interaction.options.getString('when', true));
  if (!dueAt || dueAt <= Date.now()) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid Time', `Choose a future time. ${formatInputHint()}`)]
    });
    return;
  }

  const mentionable = interaction.options.getMentionable('ping');
  const repeat = normalizeRepeat(interaction.options.getString('repeat') || 'once');
  if (!repeat) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid Repeat Schedule', formatRepeatHint())]
    });
    return;
  }
  const title = interaction.options.getString('title', true).trim();
  if (!title) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid Title', 'The reminder title cannot be empty.')]
    });
    return;
  }
  const draft = {
    title,
    details: interaction.options.getString('details')?.trim() || '',
    inputTime: interaction.options.getString('when', true),
    dueAt,
    channelId: interaction.options.getChannel('channel', true).id,
    pingText: mentionable?.toString() || '',
    repeat,
    priority: interaction.options.getString('priority') || 'important',
    guildId: interaction.guildId,
    createdBy: interaction.user.id
  };
  const token = randomUUID();
  pendingReminders.set(token, { draft, expiresAt: Date.now() + PENDING_TTL_MS });
  await interaction.reply(previewPayload(token, draft));
}

export async function listRemindersReply(interaction) {
  const store = await getReminderStore();
  const reminders = store.reminders
    .filter((item) => item.guildId === interaction.guildId && ['scheduled', 'awaiting'].includes(item.status))
    .sort((a, b) => a.dueAt - b.dueAt);
  const body = reminders.length
    ? reminders.slice(0, 20).map((item) =>
      `**${item.title}** — \`${item.id}\`\n<t:${Math.floor(item.dueAt / 1000)}:F> — ${formatPriority(item.priority)} — ${item.status}`
    ).join('\n\n')
    : 'No active reminders are saved for this server.';
  await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Active Reminders', body)] });
}

export async function openSavedReminderEditor(interaction) {
  const id = interaction.options.getString('id', true).trim();
  const store = await getReminderStore();
  const reminder = store.reminders.find((item) => item.guildId === interaction.guildId && item.id === id);
  if (!reminder || ['completed', 'cancelled'].includes(reminder.status)) {
    await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Not Found', 'No active reminder has that ID.')] });
    return;
  }
  await interaction.showModal(reminderModal(`reminder_saved_modal:${id}`, reminder));
}

export async function cancelSavedReminder(interaction) {
  const id = interaction.options.getString('id', true).trim();
  const reminder = await updateReminder(id, (current) => current.guildId === interaction.guildId ? {
    status: 'cancelled',
    cancelledAt: Date.now(),
    cancelledBy: interaction.user.id
  } : {});
  if (!reminder || reminder.guildId !== interaction.guildId) {
    await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Not Found', 'No reminder has that ID.')] });
    return;
  }
  await editActiveMessage(interaction.client, reminder, finalAlertPayload(reminder, 'Cancelled', interaction.user.id));
  await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Reminder Cancelled', `Cancelled \`${id}\`.`)] });
  await refreshReminderPanels(interaction.client);
}

export async function configureReminderPanel(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.channel;
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Invalid Channel', 'Choose a text channel.')] });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const store = await getReminderStore();
  const existing = store.panels.find((item) => item.guildId === interaction.guildId);
  const guildReminders = store.reminders.filter((item) => item.guildId === interaction.guildId);
  let message;
  if (existing?.channelId === channel.id) {
    message = await channel.messages.fetch(existing.messageId).catch(() => null);
    if (message) await message.edit(dashboardPayload(guildReminders));
  }
  if (!message) {
    message = await channel.send(dashboardPayload(guildReminders));
    if (existing) {
      const oldChannel = await interaction.client.channels.fetch(existing.channelId).catch(() => null);
      const oldMessage = oldChannel?.isTextBased()
        ? await oldChannel.messages.fetch(existing.messageId).catch(() => null)
        : null;
      await oldMessage?.delete().catch(() => {});
    }
  }
  await upsertReminderPanel({
    guildId: interaction.guildId,
    channelId: channel.id,
    messageId: message.id,
    ownerId: interaction.user.id
  });
  await interaction.editReply({
    flags: privateCv2Flags,
    components: [simpleContainer('Reminder Panel Ready', `The dashboard will stay updated in ${channel}.`)]
  });
}

function reminderModal(customId, reminder) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Edit Reminder')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Title')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(reminder.title)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('Details')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1_500)
          .setValue(reminder.details || '')
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('when')
          .setLabel('When (IST or relative)')
          .setStyle(TextInputStyle.Short)
          .setValue(reminder.inputTime || formatEditableIst(reminder.dueAt))
          .setRequired(true)
      )
    );
}

export async function handleReminderInteraction(interaction) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Admin Only', 'Only server administrators can manage reminders.')]
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('reminder_preview:')) {
    const [, action, token] = interaction.customId.split(':');
    const pending = pendingReminders.get(token);
    if (!pending || pending.expiresAt <= Date.now() || pending.draft.createdBy !== interaction.user.id) {
      pendingReminders.delete(token);
      await interaction.update({
        components: [simpleContainer('Preview Expired', 'Run `/reminder create` again.')]
      });
      return true;
    }
    if (action === 'edit') {
      await interaction.showModal(reminderModal(`reminder_preview_modal:${token}`, pending.draft));
      return true;
    }
    if (action === 'cancel') {
      pendingReminders.delete(token);
      await interaction.update({ components: [simpleContainer('Cancelled', 'The reminder was not created.')] });
      return true;
    }
    if (action === 'confirm') {
      const now = Date.now();
      const reminder = {
        ...pending.draft,
        id: reminderId(),
        occurrenceAt: pending.draft.dueAt,
        status: 'scheduled',
        createdAt: now,
        activeMessageId: null,
        deliveredAt: null,
        escalationCount: 0,
        lastEscalatedAt: null,
        completedAt: null,
        completedBy: null,
        cancelledAt: null,
        cancelledBy: null
      };
      delete reminder.inputTime;
      await addReminder(reminder);
      pendingReminders.delete(token);
      await interaction.update({
        components: [simpleContainer(
          'Reminder Scheduled',
          `**${reminder.title}** will be sent <t:${Math.floor(reminder.dueAt / 1000)}:R>.\nID: \`${reminder.id}\``
        )]
      });
      await refreshReminderPanels(interaction.client);
      return true;
    }
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('reminder_preview_modal:')) {
    const token = interaction.customId.split(':')[1];
    const pending = pendingReminders.get(token);
    if (!pending || pending.draft.createdBy !== interaction.user.id) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Preview Expired', 'Run `/reminder create` again.')] });
      return true;
    }
    const inputTime = interaction.fields.getTextInputValue('when');
    const dueAt = parseReminderTime(inputTime);
    if (!dueAt || dueAt <= Date.now()) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Invalid Time', formatInputHint())] });
      return true;
    }
    const title = interaction.fields.getTextInputValue('title').trim();
    if (!title) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Invalid Title', 'The reminder title cannot be empty.')] });
      return true;
    }
    pending.draft = {
      ...pending.draft,
      title,
      details: interaction.fields.getTextInputValue('details').trim(),
      inputTime,
      dueAt
    };
    pending.expiresAt = Date.now() + PENDING_TTL_MS;
    await interaction.update({ components: previewPayload(token, pending.draft).components });
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('reminder_saved_modal:')) {
    const id = interaction.customId.split(':')[1];
    const store = await getReminderStore();
    const current = store.reminders.find((item) => item.guildId === interaction.guildId && item.id === id);
    if (!current || ['completed', 'cancelled'].includes(current.status)) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Not Found', 'No active reminder has that ID.')] });
      return true;
    }
    const dueAt = parseReminderTime(interaction.fields.getTextInputValue('when'));
    if (!dueAt || dueAt <= Date.now()) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Invalid Time', formatInputHint())] });
      return true;
    }
    const title = interaction.fields.getTextInputValue('title').trim();
    if (!title) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Invalid Title', 'The reminder title cannot be empty.')] });
      return true;
    }
    const reminder = await updateReminder(id, {
      title,
      details: interaction.fields.getTextInputValue('details').trim(),
      dueAt,
      occurrenceAt: dueAt,
      status: 'scheduled',
      activeMessageId: null,
      deliveredAt: null,
      escalationCount: 0
    });
    await editActiveMessage(interaction.client, current, finalAlertPayload(
      current,
      'Snoozed',
      interaction.user.id,
      `The edited reminder will return <t:${Math.floor(dueAt / 1000)}:R>.`
    ));
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Reminder Updated', `**${reminder.title}** is now due <t:${Math.floor(dueAt / 1000)}:R>.`)]
    });
    await refreshReminderPanels(interaction.client);
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'reminder_panel:details') {
    const store = await getReminderStore();
    const reminder = store.reminders.find((item) => item.guildId === interaction.guildId && item.id === interaction.values[0]);
    await interaction.reply({
      flags: privateCv2Flags,
      components: [reminder
        ? simpleContainer('Reminder Details', reminderDetails(reminder))
        : simpleContainer('Not Found', 'That reminder no longer exists.')]
    });
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('reminder_action:')) {
    const [, action, id] = interaction.customId.split(':');
    const store = await getReminderStore();
    const current = store.reminders.find((item) => item.guildId === interaction.guildId && item.id === id);
    if (!current || current.status !== 'awaiting') {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Already Handled', 'This reminder is no longer waiting.')] });
      return true;
    }

    if (action === 'done') {
      const nextAt = current.repeat === 'once'
        ? null
        : nextFutureRepeatAt(current.occurrenceAt, current.repeat);
      const updated = await updateReminder(id, nextAt ? {
        status: 'scheduled',
        dueAt: nextAt,
        occurrenceAt: nextAt,
        activeMessageId: null,
        deliveredAt: null,
        escalationCount: 0,
        completedAt: Date.now(),
        completedBy: interaction.user.id
      } : {
        status: 'completed',
        completedAt: Date.now(),
        completedBy: interaction.user.id
      });
      await interaction.update(finalAlertPayload(
        updated,
        'Completed',
        interaction.user.id,
        nextAt ? `Next reminder: <t:${Math.floor(nextAt / 1000)}:F>` : ''
      ));
      await refreshReminderPanels(interaction.client);
      return true;
    }

    if (['snooze10', 'snooze60', 'tomorrow'].includes(action)) {
      const delay = action === 'snooze10' ? 600_000 : action === 'snooze60' ? 3_600_000 : 86_400_000;
      const dueAt = Date.now() + delay;
      const updated = await updateReminder(id, {
        status: 'scheduled',
        dueAt,
        activeMessageId: null,
        deliveredAt: null,
        escalationCount: 0
      });
      await interaction.update(finalAlertPayload(
        updated,
        'Snoozed',
        interaction.user.id,
        `It will return <t:${Math.floor(dueAt / 1000)}:R>.`
      ));
      await refreshReminderPanels(interaction.client);
      return true;
    }

    if (action === 'cancel') {
      const updated = await updateReminder(id, {
        status: 'cancelled',
        cancelledAt: Date.now(),
        cancelledBy: interaction.user.id
      });
      await interaction.update(finalAlertPayload(updated, 'Cancelled', interaction.user.id));
      await refreshReminderPanels(interaction.client);
      return true;
    }
  }

  return false;
}

async function editActiveMessage(client, reminder, payload) {
  if (!reminder.activeMessageId) return;
  const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
  const message = channel?.isTextBased()
    ? await channel.messages.fetch(reminder.activeMessageId).catch(() => null)
    : null;
  await message?.edit(payload).catch(() => {});
}

async function deliverReminder(client, reminder) {
  const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    console.warn(`Reminder channel unavailable: ${reminder.channelId} (${reminder.id})`);
    return;
  }
  const message = await channel.send(alertPayload(reminder));
  await updateReminder(reminder.id, {
    status: 'awaiting',
    activeMessageId: message.id,
    deliveredAt: Date.now(),
    escalationCount: 0,
    lastEscalatedAt: null
  });
}

async function escalateReminder(client, reminder, now) {
  const thresholds = reminder.priority === 'critical'
    ? [10 * 60_000, 30 * 60_000]
    : reminder.priority === 'important'
      ? [15 * 60_000]
      : [];
  const threshold = thresholds[reminder.escalationCount];
  if (threshold === undefined || now < reminder.deliveredAt + threshold) return;

  const channel = await client.channels.fetch(reminder.channelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') return;
  const link = `https://discord.com/channels/${reminder.guildId}/${reminder.channelId}/${reminder.activeMessageId}`;
  await channel.send({
    flags: cv2Flags,
    allowedMentions: allowedMentions(reminder.pingText),
    components: [new ContainerBuilder()
      .setAccentColor(priorityColor(reminder.priority))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent([
        '## Reminder Still Waiting',
        `**${reminder.title}** has not been acknowledged.`,
        reminder.pingText || '',
        `[Open reminder](${link})`
      ].filter(Boolean).join('\n')))]
  });
  await updateReminder(reminder.id, {
    escalationCount: reminder.escalationCount + 1,
    lastEscalatedAt: now
  });
}

export async function checkRemindersNow(client) {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const store = await getReminderStore();
    const now = Date.now();
    for (const [token, pending] of pendingReminders) {
      if (pending.expiresAt <= now) pendingReminders.delete(token);
    }
    for (const reminder of store.reminders) {
      try {
        if (reminder.status === 'scheduled' && reminder.dueAt <= now) {
          await deliverReminder(client, reminder);
        } else if (reminder.status === 'awaiting' && reminder.deliveredAt) {
          await escalateReminder(client, reminder, now);
        }
      } catch (error) {
        console.error(`Reminder scheduler error (${reminder.id}):`, error);
      }
    }
  } finally {
    schedulerRunning = false;
  }
}

export async function refreshReminderPanels(client) {
  if (panelRunning) return;
  panelRunning = true;
  try {
    const store = await getReminderStore();
    for (const panel of store.panels) {
      try {
        const channel = await client.channels.fetch(panel.channelId).catch(() => null);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') continue;
        const reminders = store.reminders.filter((item) => item.guildId === panel.guildId);
        let message = await channel.messages.fetch(panel.messageId).catch(() => null);
        if (!message) {
          message = await channel.send(dashboardPayload(reminders));
          await upsertReminderPanel({ ...panel, messageId: message.id });
        } else {
          await message.edit(dashboardPayload(reminders));
        }
      } catch (error) {
        console.error(`Reminder panel refresh error (${panel.guildId}):`, error);
      }
    }
  } finally {
    panelRunning = false;
  }
}

export function startReminderScheduler(client) {
  if (schedulerTimer) clearInterval(schedulerTimer);
  if (panelTimer) clearInterval(panelTimer);
  void checkRemindersNow(client);
  void refreshReminderPanels(client);
  schedulerTimer = setInterval(() => { void checkRemindersNow(client); }, CHECK_INTERVAL_MS);
  schedulerTimer.unref();
  panelTimer = setInterval(() => { void refreshReminderPanels(client); }, PANEL_INTERVAL_MS);
  panelTimer.unref();
}
