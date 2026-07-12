import { SlashCommandBuilder } from 'discord.js';
import {
  addAutoReply,
  addStickerAutoReply,
  listAutoReplyWhitelistReply,
  listAutoRepliesReply,
  removeAutoReplyReply,
  unwhitelistAutoReplyUser,
  whitelistAutoReplyUser
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
        .setName('sticker')
        .setDescription('Reply with a sticker when a message contains a word.')
        .addStringOption((option) =>
          option
            .setName('word')
            .setDescription('Word or text to detect.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('sticker_id')
            .setDescription('Sticker ID the bot should send.')
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
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('whitelist')
        .setDescription('Stop auto replies for a user.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User who should not trigger auto replies.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unwhitelist')
        .setDescription('Allow auto replies for a user again.')
        .addUserOption((option) =>
          option
            .setName('user')
            .setDescription('User to remove from auto reply whitelist.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('whitelist-list')
        .setDescription('Show users who do not trigger auto replies.')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'add') {
      await addAutoReply(interaction);
      return;
    }

    if (subcommand === 'sticker') {
      await addStickerAutoReply(interaction);
      return;
    }

    if (subcommand === 'list') {
      await listAutoRepliesReply(interaction);
      return;
    }

    if (subcommand === 'remove') {
      await removeAutoReplyReply(interaction);
      return;
    }

    if (subcommand === 'whitelist') {
      await whitelistAutoReplyUser(interaction);
      return;
    }

    if (subcommand === 'unwhitelist') {
      await unwhitelistAutoReplyUser(interaction);
      return;
    }

    if (subcommand === 'whitelist-list') {
      await listAutoReplyWhitelistReply(interaction);
    }
  }
};
