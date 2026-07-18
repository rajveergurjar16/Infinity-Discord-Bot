import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionsBitField,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';
import { getInviteStore, removeInviteApp, upsertInviteApp, upsertInvitePanel } from './inviteRegistry.js';
import { cv2Flags, privateCv2Flags, simpleContainer } from '../ui/cv2.js';

function safeName(name) {
  return name.replace(/([\\*_~`|>])/g, '\\$1');
}

function parsePermissions(value) {
  const input = String(value).trim();
  if (!/^\d+$/.test(input)) throw new Error('PERMISSIONS_NOT_INTEGER');
  const permissions = BigInt(input);
  if (permissions < 0n || permissions > PermissionsBitField.All) {
    throw new Error('PERMISSIONS_OUT_OF_RANGE');
  }
  return permissions;
}

function inviteUrl(app) {
  const params = new URLSearchParams({
    client_id: app.userId,
    permissions: app.permissions,
    scope: 'bot applications.commands'
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export function inviteDashboardPayload(apps) {
  const sorted = [...apps].sort((a, b) => a.name.localeCompare(b.name));
  const container = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '## Infinity Bot Directory\nAdd any of our applications to your server using the buttons below.'
    ));

  if (!sorted.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('No applications have been added yet.'));
  }

  for (const app of sorted.slice(0, 25)) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    );
    const details = [`### ${safeName(app.name)}`];
    if (app.description) details.push(app.description);
    const nameDisplay = new TextDisplayBuilder().setContent(details.join('\n'));
    if (app.avatarUrl) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(nameDisplay)
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(app.avatarUrl))
      );
    } else {
      container.addTextDisplayComponents(nameDisplay);
    }
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Add App')
          .setURL(inviteUrl(app))
      )
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
  ).addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Last Updated: <t:${Math.floor(Date.now() / 1000)}:f>`)
  );

  return {
    flags: cv2Flags,
    allowedMentions: { parse: [] },
    components: [container]
  };
}

async function updatePanel(client, panel, apps) {
  const channel = await client.channels.fetch(panel.channelId).catch(() => null);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') return null;
  const message = await channel.messages.fetch(panel.messageId).catch(() => null);
  if (message) {
    await message.edit(inviteDashboardPayload(apps));
    return message;
  }
  const replacement = await channel.send(inviteDashboardPayload(apps));
  await upsertInvitePanel({ ...panel, messageId: replacement.id });
  return replacement;
}

async function removeInviteDashboardApp(interaction) {
  const userId = interaction.options.getString('user_id', true).trim();
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid User ID', 'Provide the Discord user/application ID of a bot.')]
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const removed = await removeInviteApp(userId);
  if (!removed) {
    await interaction.editReply({
      flags: privateCv2Flags,
      components: [simpleContainer('Application Not Found', 'That bot is not present in the invite dashboard.')]
    });
    return;
  }

  const store = await getInviteStore();
  await Promise.allSettled(
    store.panels.map((panel) => updatePanel(interaction.client, panel, store.apps))
  );
  await interaction.editReply({
    flags: privateCv2Flags,
    components: [simpleContainer(
      'Application Removed',
      `**${removed.name}** was removed from every configured invite dashboard.`
    )]
  });
}

export async function configureInviteDashboard(interaction) {
  const action = interaction.options.getSubcommand(false) || 'add';
  if (action === 'remove') {
    await removeInviteDashboardApp(interaction);
    return;
  }

  const userId = interaction.options.getString('user_id', true).trim();
  const permissionInput = interaction.options.getString('permissions', true);
  const description = interaction.options.getString('description')?.trim().slice(0, 300) || '';
  const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;

  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid User ID', 'Provide the Discord user/application ID of a bot.')]
    });
    return;
  }

  let permissions;
  try {
    permissions = parsePermissions(permissionInput);
  } catch {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid Permission Integer', 'Provide a valid non-negative Discord permission integer.')]
    });
    return;
  }

  if (!targetChannel?.isTextBased() || typeof targetChannel.send !== 'function') {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Invalid Channel', 'Choose a text channel for the invite dashboard.')]
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const user = await interaction.client.users.fetch(userId, { force: true }).catch(() => null);
  if (!user?.bot) {
    await interaction.editReply({
      flags: privateCv2Flags,
      components: [simpleContainer('Bot Not Found', 'That ID does not belong to a Discord bot user.')]
    });
    return;
  }

  const avatarExtension = user.avatar?.startsWith('a_') ? 'gif' : 'png';
  await upsertInviteApp({
    userId,
    name: user.globalName || user.username,
    avatarUrl: user.displayAvatarURL({ extension: avatarExtension, size: 256 }),
    description,
    permissions: permissions.toString(),
    addedBy: interaction.user.id,
    updatedAt: Date.now()
  });

  const store = await getInviteStore();
  const existingPanel = store.panels.find((panel) => panel.guildId === interaction.guildId);
  let dashboardMessage;

  if (existingPanel && existingPanel.channelId === targetChannel.id) {
    dashboardMessage = await updatePanel(interaction.client, existingPanel, store.apps);
  } else {
    dashboardMessage = await targetChannel.send(inviteDashboardPayload(store.apps));
    if (existingPanel) {
      const oldChannel = await interaction.client.channels.fetch(existingPanel.channelId).catch(() => null);
      const oldMessage = oldChannel?.isTextBased()
        ? await oldChannel.messages.fetch(existingPanel.messageId).catch(() => null)
        : null;
      await oldMessage?.delete().catch(() => {});
    }
    await upsertInvitePanel({
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      messageId: dashboardMessage.id,
      ownerId: interaction.user.id
    });
  }

  if (!dashboardMessage) {
    dashboardMessage = await targetChannel.send(inviteDashboardPayload(store.apps));
    await upsertInvitePanel({
      guildId: interaction.guildId,
      channelId: targetChannel.id,
      messageId: dashboardMessage.id,
      ownerId: interaction.user.id
    });
  }

  await interaction.editReply({
    flags: privateCv2Flags,
    components: [simpleContainer(
      'Invite Dashboard Updated',
      `**${user.globalName || user.username}** is available in ${targetChannel}.`
    )]
  });
}
