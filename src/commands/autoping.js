import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import {
  getAutoPingConfig,
  removeAutoPingConfig,
  setAutoPingConfig
} from '../autoping/autoPingStore.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

function privateReply(title, body) {
  return {
    flags: privateCv2Flags,
    components: [simpleContainer(title, body)]
  };
}

export const autoPingCommand = {
  data: new SlashCommandBuilder()
    .setName('autoping')
    .setDescription('Configure a temporary ping for every new member.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel where new members should be pinged.')
        .addChannelTypes(ChannelType.GuildText)
    )
    .addBooleanOption((option) =>
      option
        .setName('disable')
        .setDescription('Disable automatic new-member pings in this server.')
    ),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply(privateReply('Missing Permission', 'You need **Manage Server** to configure auto-ping.'));
      return;
    }

    const disable = interaction.options.getBoolean('disable') === true;
    const channel = interaction.options.getChannel('channel');

    if (disable) {
      const removed = await removeAutoPingConfig(interaction.guildId);
      await interaction.reply(privateReply(
        'Auto-Ping Disabled',
        removed ? 'New members will no longer be pinged.' : 'Auto-ping was already disabled in this server.'
      ));
      return;
    }

    if (!channel) {
      const current = await getAutoPingConfig(interaction.guildId);
      await interaction.reply(privateReply(
        'Auto-Ping Configuration',
        current
          ? `New members are currently pinged in <#${current.channelId}>.\n-# Set another channel or use \`/autoping disable:true\`.`
          : 'Choose a channel to enable it: `/autoping channel:#channel`.'
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

    await setAutoPingConfig(interaction.guildId, channel.id, interaction.user.id);
    await interaction.reply(privateReply(
      'Auto-Ping Enabled',
      `Every new member will be pinged separately in ${channel}, then the ping message will be deleted automatically.`
    ));
  }
};
