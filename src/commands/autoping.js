import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import {
  addAutoPingConfig,
  listAutoPingConfigs,
  removeAutoPingConfig
} from '../autoping/autoPingStore.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

function privateReply(title, body) {
  return {
    flags: privateCv2Flags,
    components: [simpleContainer(title, body)]
  };
}

function channelOption(subcommand, description) {
  return subcommand.addChannelOption((option) => option
    .setName('channel')
    .setDescription(description)
    .addChannelTypes(ChannelType.GuildText)
    .setRequired(true));
}

export const autoPingCommand = {
  data: new SlashCommandBuilder()
    .setName('autoping')
    .setDescription('Configure temporary new-member pings in multiple channels.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) => channelOption(
      subcommand
        .setName('add')
        .setDescription('Add an auto-ping channel.'),
      'Channel where every new member should be pinged.'
    ))
    .addSubcommand((subcommand) => channelOption(
      subcommand
        .setName('remove')
        .setDescription('Remove one auto-ping channel.'),
      'Configured auto-ping channel to remove.'
    ))
    .addSubcommand((subcommand) => subcommand
      .setName('list')
      .setDescription('List every configured auto-ping channel.')),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(privateReply('Missing Permission', 'You need **Manage Server** to configure auto-ping.'));
      return;
    }

    const action = interaction.options.getSubcommand(true);
    if (action === 'list') {
      const settings = await listAutoPingConfigs(interaction.guildId);
      await interaction.reply(privateReply(
        'Auto-Ping Channels',
        settings.length
          ? settings.map((setting, index) => `${index + 1}. <#${setting.channelId}>`).join('\n')
          : 'No auto-ping channels are configured in this server.'
      ));
      return;
    }

    const channel = interaction.options.getChannel('channel', true);
    if (action === 'remove') {
      const removed = await removeAutoPingConfig(interaction.guildId, channel.id);
      await interaction.reply(privateReply(
        removed ? 'Auto-Ping Channel Removed' : 'Channel Not Configured',
        removed
          ? `${channel} will no longer receive new-member pings.`
          : `${channel} was not present in the auto-ping list.`
      ));
      return;
    }

    const permissions = channel.permissionsFor(interaction.guild.members.me);
    if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
      await interaction.reply(privateReply(
        'Missing Bot Permission',
        `I need **View Channel** and **Send Messages** in ${channel}.`
      ));
      return;
    }

    const result = await addAutoPingConfig(interaction.guildId, channel.id, interaction.user.id);
    await interaction.reply(privateReply(
      result.created ? 'Auto-Ping Channel Added' : 'Auto-Ping Channel Updated',
      `${channel} will receive a separate welcome ping for every new member, deleted automatically after delivery.`
    ));
  }
};
