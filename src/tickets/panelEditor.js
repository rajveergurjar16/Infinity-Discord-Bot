import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import {
  getTicketSettings,
  isTicketReady,
  saveTicketSettings,
  updateTicketSettings
} from './ticketSettings.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';

function normalizeColor(value) {
  if (!value) return '#0055ff';
  const clean = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean}`;
  return '#0055ff';
}

function makeId(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

function parseEmoji(emoji) {
  if (!emoji) return undefined;
  const custom = emoji.match(/^<(?<animated>a?):(?<name>[a-zA-Z0-9_]+):(?<id>\d+)>$/);
  if (custom?.groups) {
    return {
      name: custom.groups.name,
      id: custom.groups.id,
      animated: custom.groups.animated === 'a'
    };
  }
  return emoji;
}

function mentionOrPending(id, type) {
  if (!id) return 'Not selected';
  if (type === 'channel') return `<#${id}>`;
  if (type === 'role') return `<@&${id}>`;
  return id;
}

export function buildTicketPanelEmbed(settings) {
  const title = settings.panelTitle || 'Support Tickets';
  const description = settings.panelDescription || 'Select the type of help you need from the menu below.';
  const embed = new EmbedBuilder()
    .setDescription(`# ${title}\n${description}`)
    .setColor(normalizeColor(settings.color));

  if (settings.authorText) {
    embed.setAuthor({
      name: settings.authorText,
      iconURL: settings.authorIconUrl || undefined
    });
  }

  if (settings.thumbnailUrl) embed.setThumbnail(settings.thumbnailUrl);
  if (settings.imageUrl) embed.setImage(settings.imageUrl);

  if (settings.footerText) {
    embed.setFooter({
      text: settings.footerText,
      iconURL: settings.footerIconUrl || undefined
    });
  }

  return embed;
}

export function buildTicketPanelComponents(settings, disabled = false) {
  const options = settings.types.slice(0, 25).map((type) => ({
    label: type.label,
    description: type.description,
    value: type.id,
    emoji: parseEmoji(type.emoji)
  }));

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket:create')
        .setPlaceholder(options.length ? 'Choose a ticket type' : 'No ticket types added')
        .setDisabled(disabled || !options.length)
        .addOptions(options.length ? options : [{ label: 'No types added', value: 'none' }])
    )
  ];
}

export function buildEditorComponents(settings) {
  const typeOptions = settings.types.length
    ? settings.types.slice(0, 25).map((type) => ({
        label: type.label,
        description: type.description,
        value: type.id,
        emoji: parseEmoji(type.emoji)
      }))
    : [{ label: 'No ticket types added', value: 'none', description: 'Add one from the editor below.' }];

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_editor:type_preview')
        .setPlaceholder('Ticket type selector preview')
        .setDisabled(!settings.types.length)
        .addOptions(typeOptions)
    ),
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_editor:action')
        .setPlaceholder('Open editor')
        .addOptions([
          {
            label: 'Edit Text & Color',
            description: 'Title, description, author, footer, embed color.',
            value: 'text'
          },
          {
            label: 'Edit Images',
            description: 'Author icon, thumbnail, large image, footer icon.',
            value: 'images'
          },
          {
            label: 'Add Ticket Type',
            description: 'Add title, description, and emoji.',
            value: 'add_type'
          },
          {
            label: 'Remove Ticket Type',
            description: 'Remove an existing ticket type.',
            value: 'remove_type'
          },
          {
            label: 'Select Open Category',
            description: 'Choose where ticket channels are created.',
            value: 'category'
          },
          {
            label: 'Select Panel Channel',
            description: 'Choose where the final ticket panel is sent.',
            value: 'panel_channel'
          },
          {
            label: 'Select Transcript Channel',
            description: 'Choose where transcripts are saved.',
            value: 'log_channel'
          },
          {
            label: 'Select Staff Roles',
            description: 'Roles that can access tickets.',
            value: 'staff_roles'
          },
          {
            label: 'Set IDs Manually',
            description: 'Use IDs if Discord selector does not show a channel.',
            value: 'manual_ids'
          }
        ])
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_editor:send')
        .setLabel('Send Panel')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('ticket_editor:cancel')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export async function openPanelEditor(interaction) {
  const settings = await getTicketSettings();

  await interaction.reply({
    embeds: [buildTicketPanelEmbed(settings)],
    components: buildEditorComponents(settings),
    flags: 64
  });
}

async function updateEditorPreview(interaction, settings) {
  await interaction.update({
    embeds: [buildTicketPanelEmbed(settings)],
    components: buildEditorComponents(settings)
  });
}

export async function handleEditorAction(interaction) {
  const action = interaction.values[0];
  const settings = await getTicketSettings();

  if (action === 'text') {
    await showTextModal(interaction, settings);
    return;
  }

  if (action === 'images') {
    await showImagesModal(interaction, settings);
    return;
  }

  if (action === 'add_type') {
    await showTypeModal(interaction);
    return;
  }

  if (action === 'remove_type') {
    await showRemoveTypeSelector(interaction, settings);
    return;
  }

  if (action === 'manual_ids') {
    await showManualIdsModal(interaction, settings);
    return;
  }

  if (action === 'category') {
    await interaction.update({
      content: 'Select the category where new ticket channels should open. If it is not visible, type its name to search.',
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('ticket_editor_select:category')
            .setPlaceholder('Select ticket open category')
            .setChannelTypes(ChannelType.GuildCategory)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    });
    return;
  }

  if (action === 'panel_channel') {
    await interaction.update({
      content: 'Select the channel where the final ticket panel should be sent. If it is not visible, type its name to search.',
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('ticket_editor_select:panel_channel')
            .setPlaceholder('Select ticket panel channel')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    });
    return;
  }

  if (action === 'log_channel') {
    await interaction.update({
      content: 'Select the channel where ticket transcripts should be sent. If it is not visible, type its name to search.',
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId('ticket_editor_select:log_channel')
            .setPlaceholder('Select transcript channel')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1)
        )
      ]
    });
    return;
  }

  if (action === 'staff_roles') {
    await interaction.update({
      content: 'Select staff role(s) that can view and manage tickets.',
      embeds: [],
      components: [
        new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId('ticket_editor_select:staff_roles')
            .setPlaceholder('Select staff roles')
            .setMinValues(1)
            .setMaxValues(25)
        )
      ]
    });
  }
}

export async function ignoreTypePreview(interaction) {
  await interaction.deferUpdate();
}

async function showRemoveTypeSelector(interaction, settings) {
  if (!settings.types.length) {
    await interaction.update({
      content: null,
      embeds: [buildTicketPanelEmbed(settings)],
      components: buildEditorComponents(settings)
    });
    await interaction.followUp({
      flags: privateCv2Flags,
      components: [simpleContainer('No Ticket Types', 'There are no ticket types to remove.')]
    });
    return;
  }

  await interaction.update({
    content: 'Select the ticket type you want to remove.',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_editor_select:remove_type')
          .setPlaceholder('Remove ticket type')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            settings.types.slice(0, 25).map((type) => ({
              label: type.label,
              description: type.description,
              value: type.id,
              emoji: parseEmoji(type.emoji)
            }))
          )
      )
    ]
  });
}

function addModalText(modal, id, label, value, style = TextInputStyle.Short, required = false) {
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(id)
        .setLabel(label)
        .setStyle(style)
        .setRequired(required)
        .setValue(value || '')
    )
  );
}

async function showTextModal(interaction, settings) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_editor_modal:text')
    .setTitle('Edit Panel Text');

  addModalText(modal, 'title', 'Title', settings.panelTitle, TextInputStyle.Short, true);
  addModalText(modal, 'description', 'Description', settings.panelDescription, TextInputStyle.Paragraph, true);
  addModalText(modal, 'authorText', 'Author Text', settings.authorText);
  addModalText(modal, 'footerText', 'Footer Text', settings.footerText);
  addModalText(modal, 'color', 'Embed Color (#0055ff)', settings.color);

  await interaction.showModal(modal);
}

async function showImagesModal(interaction, settings) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_editor_modal:images')
    .setTitle('Edit Panel Images');

  addModalText(modal, 'authorIconUrl', 'Author Icon URL', settings.authorIconUrl);
  addModalText(modal, 'thumbnailUrl', 'Top Thumbnail URL', settings.thumbnailUrl);
  addModalText(modal, 'bottomThumbnailUrl', 'Bottom Thumbnail URL', settings.bottomThumbnailUrl);
  addModalText(modal, 'imageUrl', 'Large Image URL', settings.imageUrl);
  addModalText(modal, 'footerIconUrl', 'Footer Icon URL', settings.footerIconUrl);

  await interaction.showModal(modal);
}

async function showTypeModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_editor_modal:add_type')
    .setTitle('Add Ticket Type');

  addModalText(modal, 'label', 'Type Title', '', TextInputStyle.Short, true);
  addModalText(modal, 'description', 'Type Description', '', TextInputStyle.Paragraph, true);
  addModalText(modal, 'emoji', 'Emoji or Custom Emoji', '');

  await interaction.showModal(modal);
}

async function showManualIdsModal(interaction, settings) {
  const modal = new ModalBuilder()
    .setCustomId('ticket_editor_modal:manual_ids')
    .setTitle('Set Ticket IDs');

  addModalText(modal, 'categoryId', 'Ticket Category ID', settings.categoryId);
  addModalText(modal, 'panelChannelId', 'Panel Channel ID', settings.panelChannelId);
  addModalText(modal, 'logChannelId', 'Transcript Channel ID', settings.logChannelId);
  addModalText(modal, 'staffRoleIds', 'Staff Role IDs, comma separated', settings.staffRoleIds.join(','));

  await interaction.showModal(modal);
}

export async function handleEditorModal(interaction) {
  const modal = interaction.customId.split(':')[1];
  const settings = await getTicketSettings();

  if (modal === 'text') {
    const next = await updateTicketSettings({
      panelTitle: interaction.fields.getTextInputValue('title'),
      panelDescription: interaction.fields.getTextInputValue('description'),
      authorText: interaction.fields.getTextInputValue('authorText') || null,
      footerText: interaction.fields.getTextInputValue('footerText') || null,
      color: normalizeColor(interaction.fields.getTextInputValue('color'))
    });

    await interaction.update({
      embeds: [buildTicketPanelEmbed(next)],
      components: buildEditorComponents(next)
    });
    return;
  }

  if (modal === 'images') {
    const next = await updateTicketSettings({
      authorIconUrl: interaction.fields.getTextInputValue('authorIconUrl') || null,
      thumbnailUrl: interaction.fields.getTextInputValue('thumbnailUrl') || null,
      bottomThumbnailUrl: interaction.fields.getTextInputValue('bottomThumbnailUrl') || null,
      imageUrl: interaction.fields.getTextInputValue('imageUrl') || null,
      footerIconUrl: interaction.fields.getTextInputValue('footerIconUrl') || null
    });

    await interaction.update({
      embeds: [buildTicketPanelEmbed(next)],
      components: buildEditorComponents(next)
    });
    return;
  }

  if (modal === 'add_type') {
    if (settings.types.length >= 25) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Type Limit Reached', 'Discord allows up to 25 options in one selector.')]
      });
      return;
    }

    const label = interaction.fields.getTextInputValue('label');
    const id = makeId(label);

    if (settings.types.some((type) => type.id === id)) {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Type Exists', `A ticket type named \`${label}\` already exists.`)]
      });
      return;
    }

    settings.types.push({
      id,
      label,
      description: interaction.fields.getTextInputValue('description'),
      emoji: interaction.fields.getTextInputValue('emoji') || null
    });

    await saveTicketSettings(settings);
    await interaction.update({
      embeds: [buildTicketPanelEmbed(settings)],
      components: buildEditorComponents(settings)
    });
    return;
  }

  if (modal === 'manual_ids') {
    const roleIds = interaction.fields
      .getTextInputValue('staffRoleIds')
      .split(',')
      .map((roleId) => roleId.trim())
      .filter(Boolean);

    const next = await updateTicketSettings({
      categoryId: interaction.fields.getTextInputValue('categoryId') || null,
      panelChannelId: interaction.fields.getTextInputValue('panelChannelId') || null,
      logChannelId: interaction.fields.getTextInputValue('logChannelId') || null,
      staffRoleIds: roleIds
    });

    await interaction.update({
      embeds: [buildTicketPanelEmbed(next)],
      components: buildEditorComponents(next)
    });
  }
}

export async function handleEditorStringSelect(interaction) {
  const action = interaction.customId.split(':')[1];

  if (action !== 'remove_type') return false;

  const settings = await getTicketSettings();
  const typeId = interaction.values[0];
  const nextTypes = settings.types.filter((type) => type.id !== typeId);

  await saveTicketSettings({ ...settings, types: nextTypes });

  const next = await getTicketSettings();
  await interaction.update({
    content: null,
    embeds: [buildTicketPanelEmbed(next)],
    components: buildEditorComponents(next)
  });

  return true;
}

export async function handleEditorChannelSelect(interaction) {
  const action = interaction.customId.split(':')[1];
  const selected = interaction.values;
  const patch = {};

  if (action === 'category') patch.categoryId = selected[0];
  if (action === 'panel_channel') patch.panelChannelId = selected[0];
  if (action === 'log_channel') patch.logChannelId = selected[0];
  if (action === 'staff_roles') patch.staffRoleIds = selected;

  const settings = await updateTicketSettings(patch);

  await interaction.update({
    content: null,
    embeds: [buildTicketPanelEmbed(settings)],
    components: buildEditorComponents(settings)
  });
}

export async function sendFinalPanel(interaction) {
  const settings = await getTicketSettings();

  if (!isTicketReady(settings)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [
        simpleContainer(
          'Setup Incomplete',
          'Select ticket category, panel channel, transcript channel, staff roles, and at least one ticket type first.'
        )
      ]
    });
    return;
  }

  const channel = await interaction.guild.channels.fetch(settings.panelChannelId);

  await channel.send({
    embeds: [buildTicketPanelEmbed(settings)],
    components: buildTicketPanelComponents(settings)
  });

  await updateEditorPreview(interaction, settings);

  await interaction.followUp({
    flags: privateCv2Flags,
    components: [simpleContainer('Panel Sent', `Ticket panel sent to ${channel}.`)]
  });
}

export async function cancelEditor(interaction) {
  await interaction.update({
    embeds: [],
    components: [],
    content: 'Ticket panel editor cancelled.'
  });
}
