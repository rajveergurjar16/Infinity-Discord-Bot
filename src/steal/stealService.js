import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { cv2Flags, privateCv2Flags, simpleContainer } from '../ui/cv2.js';

const sessions = new Map();
const EMOJI_PATTERN = /<(?<animated>a?):(?<name>[a-zA-Z0-9_]+):(?<id>\d+)>/g;
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function cleanName(name) {
  const cleaned = String(name || 'stolen')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

  if (cleaned.length >= 2) return cleaned;
  return `${cleaned || 'stolen'}_x`;
}

function createToken() {
  return Math.random().toString(36).slice(2, 10);
}

function emojiUrl(emoji) {
  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?quality=lossless`;
}

function isImageUrl(url, contentType = null) {
  if (contentType?.startsWith('image/')) return true;
  const lowerUrl = String(url).split('?')[0].toLowerCase();
  return IMAGE_EXTENSIONS.some((extension) => lowerUrl.endsWith(extension));
}

function nameFromUrl(url, fallback = 'stolen') {
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = String(url);
  }
  const file = pathname.split('/').pop() || fallback;
  return file.replace(/\.[a-z0-9]+$/i, '') || fallback;
}

function buildPreviewEmbed(asset, statusText = null) {
  const name = asset.customName || cleanName(asset.name);
  const embed = new EmbedBuilder()
    .setTitle('Steal Preview')
    .setDescription(
      [
        `Selected: **${asset.label}**`,
        `Name: \`${name}\``,
        statusText
      ].filter(Boolean).join('\n')
    )
    .setColor(statusText ? 0x57f287 : 0x5865f2);

  if (!asset.url.endsWith('.json')) {
    embed.setImage(asset.url);
  }

  return embed;
}

function collectAssets(message) {
  const assets = [];
  const seen = new Set();

  for (const match of message.content.matchAll(EMOJI_PATTERN)) {
    const { animated, name, id } = match.groups;
    if (seen.has(`emoji:${id}`)) continue;
    seen.add(`emoji:${id}`);
    assets.push({
      type: 'emoji',
      id,
      name,
      animated: Boolean(animated),
      url: emojiUrl({ id, animated: Boolean(animated) }),
      label: `${animated ? 'Animated Emoji' : 'Emoji'}: ${name}`
    });
  }

  for (const sticker of message.stickers.values()) {
    if (seen.has(`sticker:${sticker.id}`)) continue;
    seen.add(`sticker:${sticker.id}`);
    assets.push({
      type: 'sticker',
      id: sticker.id,
      name: sticker.name,
      animated: false,
      url: sticker.url,
      label: `Sticker: ${sticker.name}`
    });
  }

  for (const attachment of message.attachments.values()) {
    if (!isImageUrl(attachment.url, attachment.contentType)) continue;
    if (seen.has(`image:${attachment.url}`)) continue;
    seen.add(`image:${attachment.url}`);
    assets.push({
      type: 'image',
      id: attachment.id,
      name: nameFromUrl(attachment.name || attachment.url, 'image'),
      animated: attachment.contentType === 'image/gif' || attachment.url.split('?')[0].toLowerCase().endsWith('.gif'),
      url: attachment.url,
      label: `${attachment.contentType === 'image/gif' ? 'GIF' : 'Image'}: ${attachment.name || 'attachment'}`
    });
  }

  for (const embed of message.embeds) {
    const url = embed.image?.url || embed.thumbnail?.url;
    if (!url || !isImageUrl(url)) continue;
    if (seen.has(`image:${url}`)) continue;
    seen.add(`image:${url}`);
    assets.push({
      type: 'image',
      id: url,
      name: nameFromUrl(url, 'image'),
      animated: url.split('?')[0].toLowerCase().endsWith('.gif'),
      url,
      label: `${url.split('?')[0].toLowerCase().endsWith('.gif') ? 'GIF' : 'Image'}: embed image`
    });
  }

  return assets;
}

function buildComponents(token, session, disabled = false) {
  const rows = [];

  if (session.assets.length > 1) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`steal:select:${token}`)
          .setPlaceholder('Choose what to steal')
          .setDisabled(disabled)
          .addOptions(
            session.assets.slice(0, 25).map((asset, index) => ({
              label: asset.label.slice(0, 100),
              description: asset.url.slice(0, 100),
              value: String(index),
              default: index === session.selectedIndex
            }))
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`steal:emoji:${token}`)
        .setLabel('Steal as Emoji')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`steal:sticker:${token}`)
        .setLabel('Steal as Sticker')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`steal:name:${token}`)
        .setLabel('Edit Name')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  );

  return rows;
}

function canCreateExpressions(member) {
  return member.permissions.has(PermissionFlagsBits.CreateGuildExpressions) ||
    member.permissions.has(PermissionFlagsBits.ManageGuildExpressions);
}

function botCanCreateExpressions(guild) {
  return guild.members.me.permissions.has(PermissionFlagsBits.CreateGuildExpressions) ||
    guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions);
}

export async function handleStealPrefix(message) {
  if (message.author.bot || !message.guild) return false;
  if (!message.content.trim().toLowerCase().startsWith('>>steal')) return false;

  if (!canCreateExpressions(message.member)) {
    await message.reply({
      flags: cv2Flags,
      components: [simpleContainer('No Permission', 'You need Create Expressions or Manage Expressions permission.')]
    });
    return true;
  }

  if (!botCanCreateExpressions(message.guild)) {
    await message.reply({
      flags: cv2Flags,
      components: [simpleContainer('Bot Missing Permission', 'I need Create Expressions or Manage Expressions permission.')]
    });
    return true;
  }

  const referenceId = message.reference?.messageId;
  if (!referenceId) {
    await message.reply({
      flags: cv2Flags,
      components: [simpleContainer('Reply Required', 'Reply to a message that contains a custom emoji, sticker, image, or GIF, then use `>>steal`.')]
    });
    return true;
  }

  const target = await message.channel.messages.fetch(referenceId).catch(() => null);
  if (!target) {
    await message.reply({
      flags: cv2Flags,
      components: [simpleContainer('Message Not Found', 'I could not fetch the replied message.')]
    });
    return true;
  }

  const assets = collectAssets(target);
  if (!assets.length) {
    await message.reply({
      flags: cv2Flags,
      components: [simpleContainer('Nothing To Steal', 'The replied message has no custom emoji, sticker, image, or GIF.')]
    });
    return true;
  }

  const token = createToken();
  const session = {
    ownerId: message.author.id,
    guildId: message.guild.id,
    selectedIndex: 0,
    assets
  };
  sessions.set(token, session);

  await message.reply({
    embeds: [buildPreviewEmbed(assets[0])],
    components: buildComponents(token, session)
  });

  setTimeout(() => sessions.delete(token), 10 * 60 * 1000);
  return true;
}

export async function handleStealInteraction(interaction) {
  const [, action, token] = interaction.customId.split(':');
  const session = sessions.get(token);

  if (!session) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Expired', 'This steal menu expired. Use `>>steal` again.')]
    });
    return true;
  }

  if (interaction.user.id !== session.ownerId) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Not Yours', 'Only the user who ran `>>steal` can use this menu.')]
    });
    return true;
  }

  if (!canCreateExpressions(interaction.member)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('No Permission', 'You need Create Expressions or Manage Expressions permission.')]
    });
    return true;
  }

  if (!botCanCreateExpressions(interaction.guild)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Bot Missing Permission', 'I need Create Expressions or Manage Expressions permission.')]
    });
    return true;
  }

  if (action === 'select') {
    session.selectedIndex = Number(interaction.values[0]);
    sessions.set(token, session);
    const selected = session.assets[session.selectedIndex];
    await interaction.update({
      embeds: [buildPreviewEmbed(selected)],
      components: buildComponents(token, session)
    });
    return true;
  }

  const selected = session.assets[session.selectedIndex];

  if (action === 'name') {
    const modal = new ModalBuilder()
      .setCustomId(`steal_modal:name:${token}`)
      .setTitle('Edit Expression Name')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Name')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setValue(selected.customName || cleanName(selected.name))
        )
      );

    await interaction.showModal(modal);
    return true;
  }

  if (action === 'emoji') {
    await stealAsEmoji(interaction, selected);
    sessions.delete(token);
    return true;
  }

  if (action === 'sticker') {
    await stealAsSticker(interaction, selected);
    sessions.delete(token);
    return true;
  }

  return false;
}

export async function handleStealModal(interaction) {
  const [, action, token] = interaction.customId.split(':');
  if (action !== 'name') return false;

  const session = sessions.get(token);
  if (!session) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Expired', 'This steal menu expired. Use `>>steal` again.')]
    });
    return true;
  }

  if (interaction.user.id !== session.ownerId) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Not Yours', 'Only the user who ran `>>steal` can edit this name.')]
    });
    return true;
  }

  const selected = session.assets[session.selectedIndex];
  selected.customName = cleanName(interaction.fields.getTextInputValue('name'));
  sessions.set(token, session);

  await interaction.update({
    embeds: [buildPreviewEmbed(selected)],
    components: buildComponents(token, session)
  });
  return true;
}

async function stealAsEmoji(interaction, asset) {
  await interaction.deferReply();
  if (asset.url.endsWith('.json')) {
    await interaction.editReply({
      content: 'This sticker is a Lottie/json sticker, so it cannot be added as an emoji.'
    });
    return;
  }

  const name = asset.customName || cleanName(asset.name);
  let emoji;
  try {
    emoji = await interaction.guild.emojis.create({
      attachment: asset.url,
      name,
      reason: `Stolen by ${interaction.user.tag}`
    });
  } catch (error) {
    await interaction.editReply({
      content: `Could not create emoji. Check emoji slots, file type, and bot permissions. Error: \`${error.code ?? error.name ?? 'unknown'}\``
    });
    return;
  }

  await interaction.editReply({
    content: `Created emoji ${emoji} as \`:${emoji.name}:\`.`
  });
  await disableStealMenu(interaction, asset, `Created emoji ${emoji} as \`:${emoji.name}:\`.`);
}

async function stealAsSticker(interaction, asset) {
  await interaction.deferReply();
  if (asset.url.endsWith('.json')) {
    await interaction.editReply({
      content: 'This is a Lottie/json sticker. Discord may not allow copying it into this server.'
    });
    return;
  }

  const name = asset.customName || cleanName(asset.name);
  let sticker;
  try {
    sticker = await interaction.guild.stickers.create({
      file: asset.url,
      name,
      tags: 'sparkles',
      description: `Stolen by ${interaction.user.tag}`,
      reason: `Stolen by ${interaction.user.tag}`
    });
  } catch (error) {
    await interaction.editReply({
      content: `Could not create sticker. Check sticker slots, file type, and bot permissions. Error: \`${error.code ?? error.name ?? 'unknown'}\``
    });
    return;
  }

  await interaction.editReply({
    content: `Created sticker **${sticker.name}**.`
  });
  await disableStealMenu(interaction, asset, `Created sticker **${sticker.name}**.`);
}

async function disableStealMenu(interaction, asset, statusText) {
  const [, , token] = interaction.customId.split(':');
  const session = sessions.get(token);
  if (!session) return;

  await interaction.message.edit({
    embeds: [buildPreviewEmbed(asset, statusText)],
    components: buildComponents(token, session, true)
  }).catch(() => {});
}
