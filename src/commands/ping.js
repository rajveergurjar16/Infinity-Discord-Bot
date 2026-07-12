import { SlashCommandBuilder } from 'discord.js';
import { cv2Flags, simpleContainer } from '../ui/cv2.js';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check the bot latency.'),

  async execute(interaction) {
    const startedAt = Date.now();

    await interaction.reply({
      flags: cv2Flags,
      components: [
        simpleContainer(
          'Pong',
          [
            'Roundtrip: **checking...**',
            `WebSocket: **${Math.max(0, Math.round(interaction.client.ws.ping))}ms**`
          ].join('\n')
        )
      ]
    });

    await interaction.editReply({
      components: [
        simpleContainer(
          'Pong',
          [
            `Roundtrip: **${Date.now() - startedAt}ms**`,
            `WebSocket: **${Math.max(0, Math.round(interaction.client.ws.ping))}ms**`
          ].join('\n')
        )
      ]
    });
  }
};
