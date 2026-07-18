import {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} from 'discord.js';
import {
  cancelSavedReminder,
  configureReminderPanel,
  createReminderPreview,
  listRemindersReply,
  openSavedReminderEditor
} from '../reminders/reminderService.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

const repeatChoices = [
  { name: 'Once', value: 'once' },
  { name: 'Daily', value: 'daily' },
  { name: 'Weekly', value: 'weekly' },
  { name: 'Monthly', value: 'monthly' }
];
const priorityChoices = [
  { name: 'Normal', value: 'normal' },
  { name: 'Important', value: 'important' },
  { name: 'Critical', value: 'critical' }
];

export const reminderCommand = {
  data: new SlashCommandBuilder()
    .setName('reminder')
    .setDescription('Create and manage important server reminders.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Create a channel reminder.')
      .addStringOption((option) => option
        .setName('title')
        .setDescription('Short reminder title.')
        .setMaxLength(100)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('when')
        .setDescription('Examples: 10m, 2h, 20-07-2026 17:00 (IST).')
        .setRequired(true))
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Channel where the reminder should be delivered.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
      .addStringOption((option) => option
        .setName('details')
        .setDescription('Work details or instructions.')
        .setMaxLength(1_500))
      .addMentionableOption((option) => option
        .setName('ping')
        .setDescription('User or role to notify.'))
      .addStringOption((option) => option
        .setName('repeat')
        .setDescription('Repeat schedule.')
        .addChoices(...repeatChoices))
      .addStringOption((option) => option
        .setName('priority')
        .setDescription('Controls reminder color and escalation.')
        .addChoices(...priorityChoices)))
    .addSubcommand((subcommand) => subcommand
      .setName('list')
      .setDescription('List active reminders.'))
    .addSubcommand((subcommand) => subcommand
      .setName('edit')
      .setDescription('Edit an active reminder.')
      .addStringOption((option) => option
        .setName('id')
        .setDescription('Reminder ID from /reminder list.')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('cancel')
      .setDescription('Cancel an active reminder.')
      .addStringOption((option) => option
        .setName('id')
        .setDescription('Reminder ID from /reminder list.')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('panel')
      .setDescription('Create or move the reminder dashboard.')
      .addChannelOption((option) => option
        .setName('channel')
        .setDescription('Dashboard channel; defaults to this channel.')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))),

  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Admin Only', 'Only server administrators can manage reminders.')]
      });
      return;
    }
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'create') return createReminderPreview(interaction);
    if (subcommand === 'list') return listRemindersReply(interaction);
    if (subcommand === 'edit') return openSavedReminderEditor(interaction);
    if (subcommand === 'cancel') return cancelSavedReminder(interaction);
    if (subcommand === 'panel') return configureReminderPanel(interaction);
  }
};
