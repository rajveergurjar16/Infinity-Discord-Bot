import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { openPanelEditor } from '../tickets/panelEditor.js';

export const ticketCommand = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Setup and manage the support ticket system.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Open the interactive ticket panel editor.')
    ),

  async execute(interaction) {
    await openPanelEditor(interaction);
  }
};
