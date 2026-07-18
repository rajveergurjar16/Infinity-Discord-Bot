import { ChannelType, SlashCommandBuilder } from 'discord.js';
import { configureInviteDashboard } from '../invites/inviteDashboard.js';

export const inviteCommand = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Add or update an application in the bot invite dashboard.')
    .addStringOption((option) => option
      .setName('user_id')
      .setDescription('Discord bot user/application ID.')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('permissions')
      .setDescription('Discord permission integer requested by the invite.')
      .setRequired(true))
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Dashboard channel; defaults to the current channel.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)),

  async execute(interaction) {
    await configureInviteDashboard(interaction);
  }
};
