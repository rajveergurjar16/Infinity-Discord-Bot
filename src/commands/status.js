import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { openStatusEditor } from '../status/statusPanel.js';

export const statusCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Setup and manage the bot status panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Open the interactive bot status panel editor.')
    ),

  async execute(interaction) {
    await openStatusEditor(interaction);
  }
};
