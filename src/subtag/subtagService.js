import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import { getSubtagSettings, saveSubtagTemplate } from './subtagStore.js';

const editors = new Map();
const EDITOR_TTL_MS = 30 * 60_000;

function editorKey(guildId, userId, type) {
  return `${guildId}:${userId}:${type}`;
}

function normalizeColor(value, fallback = '#5865f2') {
  const clean = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean;
  if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean}`;
  return fallback;
}

function replacePlaceholders(value, context) {
  if (!value) return '';
  return String(value).replace(/\{(user|displayname|username|userid|tag|server|membercount|avatar)\}/gi, (_, key) =>
    context[key.toLowerCase()] ?? `{${key}}`
  );
}

function previewContext(interaction, tag = null) {
  const member = interaction.member;
  return {
    user: `<@${interaction.user.id}>`,
    displayname: member?.displayName || interaction.user.globalName || interaction.user.username,
    username: interaction.user.username,
    userid: interaction.user.id,
    tag: tag || interaction.user.primaryGuild?.tag || 'TAG',
    server: interaction.guild.name,
    membercount: String(interaction.guild.memberCount),
    avatar: interaction.user.displayAvatarURL({ extension: interaction.user.avatar?.startsWith('a_') ? 'gif' : 'png', size: 256 })
  };
}

function buildTemplateEmbed(template, context) {
  const embed = new EmbedBuilder()
    .setTitle(replacePlaceholders(template.title, context).slice(0, 256) || 'Server Tag Update')
    .setDescription(replacePlaceholders(template.description, context).slice(0, 4_096) || 'No message configured.')
    .setColor(normalizeColor(template.color));

  const footer = replacePlaceholders(template.footer, context);
  if (footer) embed.setFooter({ text: footer.slice(0, 2_048) });
  const thumbnail = replacePlaceholders(template.thumbnailUrl, context);
  const image = replacePlaceholders(template.imageUrl, context);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  return embed;
}

function editorComponents(type, template) {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`subtag_editor:action:${type}`)
        .setPlaceholder('Edit notification')
        .addOptions([
          {
            label: 'Edit Message',
            description: 'Title, description, color, and footer.',
            value: 'message'
          },
          {
            label: 'Edit Normal Message',
            description: 'Content shown above the embed; mentions can ping.',
            value: 'content'
          },
          {
            label: 'Edit Images',
            description: 'Thumbnail and large image URLs.',
            value: 'images'
          },
          {
            label: 'Select Channel',
            description: 'Choose where this notification is sent.',
            value: 'channel'
          },
          {
            label: 'Select Reward Role',
            description: 'Role added on adopt and removed with the tag.',
            value: 'role'
          },
          {
            label: 'Clear Reward Role',
            description: 'Stop automatic role add/remove.',
            value: 'clear_role'
          }
        ])
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`subtag_editor:save:${type}`)
        .setLabel('Save Configuration')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`subtag_editor:toggle:${type}`)
        .setLabel(template.enabled ? 'Disable' : 'Enable')
        .setStyle(template.enabled ? ButtonStyle.Danger : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`subtag_editor:cancel:${type}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function editorPayload(interaction, type, template) {
  const state = template.enabled ? 'Enabled' : 'Disabled';
  const context = previewContext(interaction);
  const normalContent = replacePlaceholders(template.content, context).slice(0, 2_000);
  const configuration = new EmbedBuilder()
    .setDescription([
      `**${type === 'adopt' ? 'Tag Adopted' : 'Tag Removed'} notification** — ${state}`,
      `Channel: ${template.channelId ? `<#${template.channelId}>` : 'Not selected'}`,
      `Reward role: ${template.roleId ? `<@&${template.roleId}>` : 'Not selected'}`,
      'Normal message mentions are disabled inside this preview.',
      '',
      '-# Placeholders: {user}, {displayname}, {username}, {userid}, {tag}, {server}, {membercount}, {avatar}'
    ].join('\n'))
    .setColor(0x2b2d31);
  return {
    content: normalContent || '-# No normal message configured. The notification will contain only the embed.',
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
    embeds: [buildTemplateEmbed(template, context), configuration],
    components: editorComponents(type, template),
    flags: 64
  };
}

function getEditor(interaction, type) {
  const key = editorKey(interaction.guildId, interaction.user.id, type);
  const editor = editors.get(key);
  if (!editor || editor.expiresAt <= Date.now()) {
    editors.delete(key);
    return null;
  }
  editor.expiresAt = Date.now() + EDITOR_TTL_MS;
  return editor;
}

export async function openSubtagEditor(interaction, type) {
  const settings = await getSubtagSettings(interaction.guildId);
  const draft = {
    ...settings[type],
    channelId: settings[type].channelId || interaction.channelId,
    roleId: settings.roleId
  };
  editors.set(editorKey(interaction.guildId, interaction.user.id, type), {
    draft,
    expiresAt: Date.now() + EDITOR_TTL_MS
  });
  await interaction.reply(editorPayload(interaction, type, draft));
}

function messageModal(type, template) {
  return new ModalBuilder()
    .setCustomId(`subtag_editor_modal:message:${type}`)
    .setTitle(type === 'adopt' ? 'Edit Adopt Message' : 'Edit Remove Message')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Embed Title')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(256)
          .setValue(template.title)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('description')
          .setLabel('Message')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(4_000)
          .setValue(template.description)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color')
          .setLabel('Embed Color')
          .setStyle(TextInputStyle.Short)
          .setValue(template.color)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('footer')
          .setLabel('Footer (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2_000)
          .setValue(template.footer || '')
          .setRequired(false)
      )
    );
}

function imagesModal(type, template) {
  return new ModalBuilder()
    .setCustomId(`subtag_editor_modal:images:${type}`)
    .setTitle('Edit Notification Images')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('thumbnailUrl')
          .setLabel('Thumbnail URL or {avatar}')
          .setStyle(TextInputStyle.Short)
          .setValue(template.thumbnailUrl || '')
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('imageUrl')
          .setLabel('Large Image URL')
          .setStyle(TextInputStyle.Short)
          .setValue(template.imageUrl || '')
          .setRequired(false)
      )
    );
}

export async function handleSubtagInteraction(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Admin Only', 'Only server administrators can configure tag notifications.')]
    });
    return true;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('subtag_editor:action:')) {
    const type = interaction.customId.split(':')[2];
    const editor = getEditor(interaction, type);
    if (!editor) return expireEditor(interaction);
    const action = interaction.values[0];
    if (action === 'message') {
      await interaction.showModal(messageModal(type, editor.draft));
      return true;
    }
    if (action === 'content') {
      await interaction.showModal(contentModal(type, editor.draft));
      return true;
    }
    if (action === 'images') {
      await interaction.showModal(imagesModal(type, editor.draft));
      return true;
    }
    if (action === 'channel') {
      await interaction.update({
        content: 'Select the channel for this notification.',
        embeds: [],
        components: [new ActionRowBuilder().addComponents(
          new ChannelSelectMenuBuilder()
            .setCustomId(`subtag_editor_select:channel:${type}`)
            .setPlaceholder('Select notification channel')
            .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setMinValues(1)
            .setMaxValues(1)
        )]
      });
      return true;
    }
    if (action === 'role') {
      await interaction.update({
        content: 'Select the role that should be added on tag adoption and removed when the tag is removed.',
        embeds: [],
        components: [new ActionRowBuilder().addComponents(
          new RoleSelectMenuBuilder()
            .setCustomId(`subtag_editor_select:role:${type}`)
            .setPlaceholder('Select tag reward role')
            .setMinValues(1)
            .setMaxValues(1)
        )]
      });
      return true;
    }
    if (action === 'clear_role') {
      editor.draft.roleId = null;
      await interaction.update(editorUpdatePayload(interaction, type, editor.draft));
      return true;
    }
  }

  if (
    (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) &&
    interaction.customId.startsWith('subtag_editor_select:')
  ) {
    const [, target, type] = interaction.customId.split(':');
    const editor = getEditor(interaction, type);
    if (!editor) return expireEditor(interaction);
    if (target === 'channel') editor.draft.channelId = interaction.values[0];
    if (target === 'role') editor.draft.roleId = interaction.values[0];
    await interaction.update(editorUpdatePayload(interaction, type, editor.draft));
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('subtag_editor_modal:')) {
    const [, modal, type] = interaction.customId.split(':');
    const editor = getEditor(interaction, type);
    if (!editor) {
      await interaction.reply({ flags: privateCv2Flags, components: [simpleContainer('Editor Expired', `Run \`/subtag ${type}\` again.`)] });
      return true;
    }
    if (modal === 'message') {
      editor.draft.title = interaction.fields.getTextInputValue('title').trim();
      editor.draft.description = interaction.fields.getTextInputValue('description').trim();
      editor.draft.color = normalizeColor(interaction.fields.getTextInputValue('color'), editor.draft.color);
      editor.draft.footer = interaction.fields.getTextInputValue('footer').trim() || null;
    } else if (modal === 'images') {
      editor.draft.thumbnailUrl = interaction.fields.getTextInputValue('thumbnailUrl').trim() || null;
      editor.draft.imageUrl = interaction.fields.getTextInputValue('imageUrl').trim() || null;
    } else {
      editor.draft.content = interaction.fields.getTextInputValue('content').trim() || null;
    }
    try {
      buildTemplateEmbed(editor.draft, previewContext(interaction)).toJSON();
    } catch {
      await interaction.reply({
        flags: privateCv2Flags,
        components: [simpleContainer('Invalid Image URL', 'Use a complete `https://` URL, `{avatar}`, or leave the field empty.')]
      });
      return true;
    }
    await interaction.update(editorUpdatePayload(interaction, type, editor.draft));
    return true;
  }

  if (interaction.isButton() && interaction.customId.startsWith('subtag_editor:')) {
    const [, action, type] = interaction.customId.split(':');
    const editor = getEditor(interaction, type);
    if (!editor) return expireEditor(interaction);
    if (action === 'toggle') {
      editor.draft.enabled = !editor.draft.enabled;
      await interaction.update(editorUpdatePayload(interaction, type, editor.draft));
      return true;
    }
    if (action === 'cancel') {
      editors.delete(editorKey(interaction.guildId, interaction.user.id, type));
      await interaction.update({ content: 'Subtag editor cancelled.', embeds: [], components: [] });
      return true;
    }
    if (action === 'save') {
      if (editor.draft.enabled && !editor.draft.channelId) {
        await interaction.reply({
          flags: privateCv2Flags,
          components: [simpleContainer('Channel Required', 'Select a notification channel before enabling this message.')]
        });
        return true;
      }
      if (editor.draft.roleId) {
        const role = await interaction.guild.roles.fetch(editor.draft.roleId).catch(() => null);
        if (!role || role.id === interaction.guildId || role.managed || !role.editable) {
          await interaction.reply({
            flags: privateCv2Flags,
            components: [simpleContainer(
              'Role Cannot Be Managed',
              'Choose a normal role below Infinity’s highest role and make sure Infinity has **Manage Roles** permission.'
            )]
          });
          return true;
        }
      }
      const saved = await saveSubtagTemplate(interaction.guildId, type, editor.draft, editor.draft.roleId);
      editors.delete(editorKey(interaction.guildId, interaction.user.id, type));
      await interaction.update({
        content: `**Subtag configuration saved.**\n${type === 'adopt' ? 'Adopt' : 'Remove'} notifications are ${saved.template.enabled ? `enabled in <#${saved.template.channelId}>` : 'disabled'}.\nReward role: ${saved.roleId ? `<@&${saved.roleId}>` : 'Not selected'}.`,
        embeds: [],
        components: []
      });
      return true;
    }
  }

  return false;
}

function editorUpdatePayload(interaction, type, template) {
  const payload = editorPayload(interaction, type, template);
  delete payload.flags;
  return payload;
}

function contentModal(type, template) {
  return new ModalBuilder()
    .setCustomId(`subtag_editor_modal:content:${type}`)
    .setTitle('Edit Normal Message')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Message above the embed (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2_000)
          .setValue(template.content || '')
          .setRequired(false)
      )
    );
}

async function expireEditor(interaction) {
  await interaction.update({
    content: 'Subtag editor expired. Run the subtag command again.',
    embeds: [],
    components: []
  });
  return true;
}

function activeForGuild(primaryGuild, guildId) {
  return primaryGuild?.identityGuildId === guildId && primaryGuild?.identityEnabled === true;
}

export async function handleSubtagUserUpdate(oldUser, newUser, client) {
  if (newUser.bot) return;
  const candidateGuildIds = new Set([
    oldUser.primaryGuild?.identityGuildId,
    newUser.primaryGuild?.identityGuildId
  ].filter(Boolean));

  for (const guildId of candidateGuildIds) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const wasActive = activeForGuild(oldUser.primaryGuild, guildId);
    const isActive = activeForGuild(newUser.primaryGuild, guildId);
    if (wasActive === isActive) continue;

    const type = isActive ? 'adopt' : 'remove';
    const settings = await getSubtagSettings(guildId);
    const template = settings[type];
    const member = guild.members.cache.get(newUser.id) || await guild.members.fetch(newUser.id).catch(() => null);
    if (!member) continue;
    if (settings.roleId) {
      try {
        if (isActive) await member.roles.add(settings.roleId, 'Member adopted the server tag');
        else await member.roles.remove(settings.roleId, 'Member removed the server tag');
      } catch (error) {
        console.warn('Subtag reward role update failed:', {
          guildId,
          userId: newUser.id,
          roleId: settings.roleId,
          action: isActive ? 'add' : 'remove',
          code: error?.code,
          message: error?.message
        });
      }
    }
    if (!template.enabled || !template.channelId) continue;
    const channel = await guild.channels.fetch(template.channelId).catch(() => null);
    if (!channel?.isTextBased() || typeof channel.send !== 'function') continue;
    const primaryGuild = isActive ? newUser.primaryGuild : oldUser.primaryGuild;
    const context = {
      user: `<@${newUser.id}>`,
      displayname: member.displayName,
      username: newUser.username,
      userid: newUser.id,
      tag: primaryGuild?.tag || 'TAG',
      server: guild.name,
      membercount: String(guild.memberCount),
      avatar: newUser.displayAvatarURL({ extension: newUser.avatar?.startsWith('a_') ? 'gif' : 'png', size: 256 })
    };
    const content = replacePlaceholders(template.content, context).slice(0, 2_000);
    await channel.send({
      content: content || undefined,
      allowedMentions: allowedMentionsForContent(content, newUser.id),
      embeds: [buildTemplateEmbed(template, context)]
    });
  }
}

function allowedMentionsForContent(content, userId) {
  const users = [...String(content).matchAll(/<@!?([1-9]\d{16,19})>/g)].map((match) => match[1]);
  const roles = [...String(content).matchAll(/<@&([1-9]\d{16,19})>/g)].map((match) => match[1]);
  if (String(content).includes(`<@${userId}>`)) users.push(userId);
  const parse = /@(everyone|here)\b/i.test(String(content)) ? ['everyone'] : [];
  return { parse, users: [...new Set(users)], roles: [...new Set(roles)], repliedUser: false };
}
