import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import {
  cancelGiveaway,
  listGiveawaysReply,
  manualEndGiveaway,
  rerollGiveaway,
  startGiveaway
} from '../giveaways/giveawayService.js';

export const giveawayCommand = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create and manage giveaways.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a reaction giveaway in this channel.')
        .addStringOption((option) =>
          option
            .setName('prize')
            .setDescription('Giveaway prize.')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('winners')
            .setDescription('Number of winners.')
            .setRequired(true)
            .setMinValue(1)
        )
        .addStringOption((option) =>
          option
            .setName('duration')
            .setDescription('1m, 1h, 2d, or time like 21:16.')
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Optional channel where giveaway should be posted.')
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End a giveaway immediately.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Giveaway message ID.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reroll')
        .setDescription('Reroll giveaway winners.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Giveaway message ID.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('users')
            .setDescription('Optional mentions or user IDs to replace.')
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('cancel')
        .setDescription('Cancel an active giveaway.')
        .addStringOption((option) =>
          option
            .setName('message_id')
            .setDescription('Giveaway message ID.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('reason')
            .setDescription('Cancel reason.')
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List active giveaways in this server.')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      await startGiveaway(interaction);
      return;
    }

    if (subcommand === 'end') {
      await manualEndGiveaway(interaction);
      return;
    }

    if (subcommand === 'reroll') {
      await rerollGiveaway(interaction);
      return;
    }

    if (subcommand === 'cancel') {
      await cancelGiveaway(interaction);
      return;
    }

    if (subcommand === 'list') {
      await listGiveawaysReply(interaction);
    }
  }
};
