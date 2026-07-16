import { ChannelType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { configureStatusPanel } from '../status/statusMonitor.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

export const statusPanelCommand = {
  data: new SlashCommandBuilder()
    .setName('statuspanel')
    .setDescription('Create or move the combined bot status dashboard.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel where the dashboard should stay.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Admin Only', 'You need the Manage Server permission to configure the status dashboard.')]
      });
      return;
    }

    await configureStatusPanel(interaction);
  }
};
