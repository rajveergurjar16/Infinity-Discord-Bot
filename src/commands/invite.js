import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { configureInviteDashboard } from '../invites/inviteDashboard.js';

export const inviteCommand = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Manage applications in the bot invite dashboard.')
    .addSubcommand((subcommand) => subcommand
      .setName('add')
      .setDescription('Add or update an application in the invite dashboard.')
      .addStringOption((option) => option
        .setName('user_id')
        .setDescription('Discord bot user/application ID.')
        .setRequired(true))
      .addStringOption((option) => option
        .setName('permissions')
        .setDescription('Discord permission integer requested by the invite.')
        .setRequired(true))
      .addStringOption((option) => option
        .setName('description')
        .setDescription('Optional short description shown below the bot name.')
        .setMaxLength(300))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Dashboard channel; defaults to the current channel.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Remove an application from every invite dashboard.')
      .addStringOption((option) => option
        .setName('user_id')
        .setDescription('Discord bot user/application ID to remove.')
        .setRequired(true))),

  async execute(interaction) {
    await configureInviteDashboard(interaction);
  }
};
