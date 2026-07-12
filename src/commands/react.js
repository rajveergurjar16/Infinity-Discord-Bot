import { SlashCommandBuilder } from 'discord.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

export const reactCommand = {
  data: new SlashCommandBuilder()
    .setName('react')
    .setDescription('React to a message in this channel.')
    .addStringOption((option) =>
      option
        .setName('message_id')
        .setDescription('Message ID to react on.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('emoji')
        .setDescription('Emoji to react with.')
        .setRequired(true)
    ),

  async execute(interaction) {
    const messageId = interaction.options.getString('message_id', true).trim();
    const emoji = interaction.options.getString('emoji', true).trim();

    const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
    if (!message) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Message Not Found', 'Use a message ID from this channel.')]
      });
      return;
    }

    await message.react(normalizeReactionEmoji(emoji));
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Reaction Added', `Reacted on message \`${messageId}\` with ${emoji}.`)]
    });
  }
};

function normalizeReactionEmoji(emoji) {
  const custom = emoji.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (!custom) return emoji;
  return `${custom[1]}:${custom[2]}`;
}
