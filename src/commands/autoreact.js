import { SlashCommandBuilder } from 'discord.js';
import {
  addChannelAutoReact,
  addTextAutoReact,
  listAutoReactRulesReply,
  removeAutoReactRuleReply
} from '../autoreact/autoReactService.js';

export const autoReactCommand = {
  data: new SlashCommandBuilder()
    .setName('autoreact')
    .setDescription('Owner-only automatic reaction rules.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('channel')
        .setDescription('React to every new message in a channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where every message should get the reaction.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Emoji to react with.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('text')
        .setDescription('React when a message contains specific text.')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('Text, mention, role mention, or word to detect.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('emoji')
            .setDescription('Emoji to react with.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Show saved auto reaction rules.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove an auto reaction rule.')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Rule ID from /autoreact list.')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'channel') {
      await addChannelAutoReact(interaction);
      return;
    }

    if (subcommand === 'text') {
      await addTextAutoReact(interaction);
      return;
    }

    if (subcommand === 'list') {
      await listAutoReactRulesReply(interaction);
      return;
    }

    if (subcommand === 'remove') {
      await removeAutoReactRuleReply(interaction);
    }
  }
};
