import { createHash } from 'node:crypto';
import { ChannelType } from 'discord.js';
import { config } from '../config.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import {
  addAutoReactRule,
  listAutoReactRules,
  removeAutoReactRule
} from './autoReactStore.js';

export function isBotOwner(userId) {
  return config.ownerIds.includes(userId);
}

export async function handleAutoReactMessage(message) {
  if (!message.guild || message.system || message.webhookId) return;

  const rules = await listAutoReactRules(message.guild.id);
  if (!rules.length) return;

  const emojis = new Set();

  for (const rule of rules) {
    if (rule.type === 'channel' && rule.targetId === message.channelId) {
      emojis.add(rule.reactionEmoji);
      continue;
    }

    if (rule.type === 'user_mention' && message.mentions.users.has(rule.targetId)) {
      emojis.add(rule.reactionEmoji);
      continue;
    }

    if (rule.type === 'role_mention' && message.mentions.roles.has(rule.targetId)) {
      emojis.add(rule.reactionEmoji);
      continue;
    }

    if (rule.type === 'text_contains' && message.content?.toLowerCase().includes(rule.targetText.toLowerCase())) {
      emojis.add(rule.reactionEmoji);
    }
  }

  for (const emoji of emojis) {
    await message.react(emoji).catch((error) => {
      console.warn('Auto react failed:', {
        messageId: message.id,
        channelId: message.channelId,
        emoji,
        code: error?.code,
        message: error?.message
      });
    });
  }
}

export async function addChannelAutoReact(interaction) {
  if (!(await assertOwner(interaction))) return;

  const channel = interaction.options.getChannel('channel', true);
  const emoji = interaction.options.getString('emoji', true).trim();

  if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
    await reply(interaction, 'Invalid Channel', 'Please select a text or announcement channel.');
    return;
  }

  const rule = await addAutoReactRule(buildRule(interaction, 'channel', channel.id, emoji));
  await reply(interaction, 'Auto Reaction Saved', `Rule ID: \`${rule.id}\`\nChannel: <#${channel.id}>\nEmoji: ${emoji}`);
}

export async function addTextAutoReact(interaction) {
  if (!(await assertOwner(interaction))) return;

  const triggerText = interaction.options.getString('text', true).trim();
  const emoji = interaction.options.getString('emoji', true).trim();

  if (!triggerText) {
    await reply(interaction, 'Invalid Text', 'Text cannot be empty.');
    return;
  }

  const rule = await addAutoReactRule({
    ...buildRule(interaction, 'text_contains', textId(triggerText), emoji),
    targetText: triggerText
  });
  await reply(interaction, 'Auto Reaction Saved', `Rule ID: \`${rule.id}\`\nContains: \`${triggerText}\`\nEmoji: ${emoji}`);
}

export async function listAutoReactRulesReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const rules = await listAutoReactRules(interaction.guildId);
  if (!rules.length) {
    await reply(interaction, 'Auto Reactions', 'No rules are saved for this server.');
    return;
  }

  const lines = rules.map((rule, index) => {
    const target = formatTarget(rule);
    return `**${index + 1}.** \`${rule.id}\` - ${target} - ${rule.displayEmoji}`;
  });

  await reply(interaction, 'Auto Reactions', lines.join('\n'));
}

export async function removeAutoReactRuleReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const id = interaction.options.getString('id', true).trim();
  const removed = await removeAutoReactRule(interaction.guildId, id);

  await reply(
    interaction,
    removed ? 'Auto Reaction Removed' : 'Rule Not Found',
    removed ? `Removed rule \`${id}\`.` : `No rule found with ID \`${id}\`.`
  );
}

function buildRule(interaction, type, targetId, emoji) {
  const reactionEmoji = normalizeReactionEmoji(emoji);
  return {
    id: `${type}:${targetId}:${emojiId(reactionEmoji)}`,
    guildId: interaction.guildId,
    type,
    targetId,
    reactionEmoji,
    displayEmoji: emoji,
    createdBy: interaction.user.id,
    createdAt: Date.now()
  };
}

function emojiId(emoji) {
  return createHash('sha256').update(emoji).digest('hex').slice(0, 10);
}

function normalizeReactionEmoji(emoji) {
  const custom = emoji.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (!custom) return emoji;
  return `${custom[1]}:${custom[2]}`;
}

function formatTarget(rule) {
  if (rule.type === 'channel') return `Channel <#${rule.targetId}>`;
  if (rule.type === 'user_mention') return `Mentions <@${rule.targetId}>`;
  if (rule.type === 'role_mention') return `Mentions <@&${rule.targetId}>`;
  if (rule.type === 'text_contains') return `Contains \`${rule.targetText ?? rule.targetId}\``;
  return rule.targetId;
}

function textId(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'text';
}

async function assertOwner(interaction) {
  if (isBotOwner(interaction.user.id)) return true;

  await reply(
    interaction,
    'Owner Only',
    config.ownerIds.length
      ? 'Only the bot owner can use this command.'
      : 'No bot owner is set. Add your Discord user ID in `OWNER_IDS` first.'
  );
  return false;
}

async function reply(interaction, title, body) {
  const payload = {
    flags: privateCv2Flags,
    components: [simpleContainer(title, body)]
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload);
  } else {
    await interaction.reply(payload);
  }
}
