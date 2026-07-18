import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { openSubtagEditor } from '../subtag/subtagService.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

export const subtagCommand = {
  data: new SlashCommandBuilder()
    .setName('subtag')
    .setDescription('Configure server tag adoption and removal notifications.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('adopt')
      .setDescription('Edit the notification sent when someone adopts this server tag.'))
    .addSubcommand((subcommand) => subcommand
      .setName('remove')
      .setDescription('Edit the notification sent when someone removes this server tag.')),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Admin Only', 'Only server administrators can configure tag notifications.')]
      });
      return;
    }
    await openSubtagEditor(interaction, interaction.options.getSubcommand());
  }
};
