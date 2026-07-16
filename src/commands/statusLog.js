import { randomUUID } from 'node:crypto';
import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { cv2Flags, privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import { removeStatusBot, upsertStatusBot } from '../status/statusRegistry.js';
import { checkStatusEndpoint } from '../status/statusMonitor.js';

function validStatusUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function safeName(value) {
  return value.replace(/([\\*_~`|>])/g, '\\$1');
}

function validUserId(value) {
  return /^[1-9]\d{16,19}$/.test(value);
}

async function resolveBotIdentity(interaction, userId) {
  const member = await interaction.guild?.members.fetch(userId).catch(() => null);
  const user = member?.user ?? await interaction.client.users.fetch(userId, { force: true }).catch(() => null);
  if (!user?.bot) return null;
  const avatarSource = member ?? user;
  const avatarHash = member?.avatar ?? user.avatar;
  const avatarExtension = avatarHash?.startsWith('a_') ? 'gif' : 'png';
  return {
    userId,
    name: member?.displayName || user.globalName || user.displayName || `Discord Bot ${userId}`,
    avatarUrl: avatarSource.displayAvatarURL({ extension: avatarExtension, forceStatic: false, size: 256 })
  };
}

export const statusLogCommand = {
  data: new SlashCommandBuilder()
    .setName('statuslog')
    .setDescription('Send automatic bot offline and online alerts to a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Add or update automatic status alerts for a bot.')
      .addStringOption((option) => option
        .setName('user_id')
        .setDescription('Discord user ID of the monitored bot.')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20))
      .addStringOption((option) => option
        .setName('api_url')
        .setDescription('Full status API URL.')
        .setRequired(true))
      .addStringOption((option) => option
        .setName('api_key')
        .setDescription('Secret status API key.')
        .setRequired(true)
        .setMinLength(16)
        .setMaxLength(512))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel that receives online and offline alerts.')
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addStringOption((option) => option
        .setName('pinguser')
        .setDescription('Optional mentions or text shown below every status alert.')
        .setMaxLength(1_000)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Stop automatic status alerts for a bot.')
      .addStringOption((option) => option
        .setName('user_id')
        .setDescription('Discord user ID of the monitored bot.')
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(20))),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Admin Only', 'You need the Manage Server permission to configure status logs.')]
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const action = interaction.options.getSubcommand();
    const userId = interaction.options.getString('user_id', true).trim();

    if (!validUserId(userId)) {
      await interaction.editReply({
        flags: cv2Flags,
        components: [simpleContainer('Invalid User ID', 'Enter a valid Discord bot user ID.')]
      });
      return;
    }

    if (action === 'remove') {
      const removed = await removeStatusBot(userId);
      await interaction.editReply({
        flags: cv2Flags,
        allowedMentions: { parse: [] },
        components: [simpleContainer(
          removed ? 'Status Log Removed' : 'Status Log Not Found',
          removed
            ? `Automatic alerts for **${safeName(removed.name)}** have been stopped.`
            : `No monitored bot with user ID \`${userId}\` exists.`
        )]
      });
      return;
    }

    const statusUrl = interaction.options.getString('api_url', true).trim();
    const apiKey = interaction.options.getString('api_key', true).trim();
    const channel = interaction.options.getChannel('channel', true);
    const pingText = interaction.options.getString('pinguser')?.trim() || '';
    const identity = await resolveBotIdentity(interaction, userId);

    let errorMessage;
    if (!identity) errorMessage = 'That user ID does not belong to a Discord bot I can resolve.';
    else if (!validStatusUrl(statusUrl)) errorMessage = 'Enter a complete HTTP or HTTPS status API URL.';
    else if (apiKey.length < 16) errorMessage = 'The status API key must contain at least 16 characters.';

    if (errorMessage) {
      await interaction.editReply({
        flags: cv2Flags,
        components: [simpleContainer('Invalid Status Log', errorMessage)]
      });
      return;
    }

    const entry = {
      ...identity,
      statusUrl,
      apiKey,
      channelId: channel.id,
      revision: randomUUID(),
      pingText,
      ownerId: interaction.user.id,
      createdAt: Date.now(),
      lastObservedAt: Date.now(),
      totalObservedMs: 0,
      onlineObservedMs: 0,
      stateChangedAt: Date.now()
    };
    const currentOnline = await checkStatusEndpoint(entry);
    const result = await upsertStatusBot({ ...entry, lastOnline: currentOnline });
    await interaction.editReply({
      flags: cv2Flags,
      allowedMentions: { parse: [] },
      components: [simpleContainer(
        result.created ? 'Status Log Added' : 'Status Log Updated',
        `**${safeName(identity.name)}** alerts will be sent to ${channel}. Current baseline: **${currentOnline ? 'Online' : 'Offline'}**. No restart is required.`
      )]
    });
  }
};
