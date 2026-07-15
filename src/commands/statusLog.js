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

export const statusLogCommand = {
  data: new SlashCommandBuilder()
    .setName('statuslog')
    .setDescription('Send automatic bot offline and online alerts to a channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Add or update automatic status alerts for a bot.')
      .addStringOption((option) => option
        .setName('name')
        .setDescription('Bot name shown in status alerts.')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(50))
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
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Stop automatic status alerts for a bot.')
      .addStringOption((option) => option
        .setName('name')
        .setDescription('Exact monitored bot name.')
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(50))),

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
    const name = interaction.options.getString('name', true).trim();

    if (action === 'remove') {
      const removed = await removeStatusBot(name);
      await interaction.editReply({
        flags: cv2Flags,
        allowedMentions: { parse: [] },
        components: [simpleContainer(
          removed ? 'Status Log Removed' : 'Status Log Not Found',
          removed
            ? `Automatic alerts for **${safeName(name)}** have been stopped.`
            : `No monitored bot named **${safeName(name)}** exists.`
        )]
      });
      return;
    }

    const statusUrl = interaction.options.getString('api_url', true).trim();
    const apiKey = interaction.options.getString('api_key', true).trim();
    const channel = interaction.options.getChannel('channel', true);

    let errorMessage;
    if (!name) errorMessage = 'Enter a bot name.';
    else if (!validStatusUrl(statusUrl)) errorMessage = 'Enter a complete HTTP or HTTPS status API URL.';
    else if (apiKey.length < 16) errorMessage = 'The status API key must contain at least 16 characters.';

    if (errorMessage) {
      await interaction.editReply({
        flags: cv2Flags,
        components: [simpleContainer('Invalid Status Log', errorMessage)]
      });
      return;
    }

    const entry = { name, statusUrl, apiKey, channelId: channel.id, revision: randomUUID() };
    const currentOnline = await checkStatusEndpoint(entry);
    const result = await upsertStatusBot({ ...entry, lastOnline: currentOnline });
    await interaction.editReply({
      flags: cv2Flags,
      allowedMentions: { parse: [] },
      components: [simpleContainer(
        result.created ? 'Status Log Added' : 'Status Log Updated',
        `**${safeName(name)}** alerts will be sent to ${channel}. Current baseline: **${currentOnline ? 'Online' : 'Offline'}**. No restart is required.`
      )]
    });
  }
};
