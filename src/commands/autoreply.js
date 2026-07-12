import { SlashCommandBuilder } from 'discord.js';
import {
  addAutoReply,
  listAutoRepliesReply,
  removeAutoReplyReply
} from '../autoreply/autoReplyService.js';

export const autoReplyCommand = {
  data: new SlashCommandBuilder()
    .setName('autoreply')
    .setDescription('Owner-only automatic word replies.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Reply when a message contains a word.')
        .addStringOption((option) =>
          option
            .setName('word')
            .setDescription('Word or text to detect.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('reply')
            .setDescription('Message the bot should send.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show saved auto replies.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove an auto reply.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Rule ID from /autoreply list.')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      await addAutoReply(interaction);
      return;
    }

    if (subcommand === 'list') {
      await listAutoRepliesReply(interaction);
      return;
    }

    if (subcommand === 'remove') {
      await removeAutoReplyReply(interaction);
    }
  }
};
