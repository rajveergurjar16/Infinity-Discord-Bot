import { isBotOwner } from '../autoreact/autoReactService.js';
import { privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import {
  addAutoReplyRule,
  addAutoReplyWhitelistUser,
  isAutoReplyWhitelisted,
  listAutoReplyWhitelist,
  listAutoReplyRules,
  removeAutoReplyRule,
  removeAutoReplyWhitelistUser
} from './autoReplyStore.js';

export async function handleAutoReplyMessage(message) {
  if (!message.guild || message.author.bot || message.system || message.webhookId) return;
  if (await isAutoReplyWhitelisted(message.guild.id, message.author.id)) return;

  const content = message.content;
  if (!content) return;

  const rules = await listAutoReplyRules(message.guild.id);
  if (!rules.length) return;

  const matchedReplies = [];
  for (const rule of rules) {
    if (matchesTrigger(content, rule.trigger)) {
      matchedReplies.push(rule);
    }
  }

  for (const rule of matchedReplies) {
    await message.reply(buildAutoReplyPayload(rule)).catch((error) => {
      console.warn('Auto reply failed:', {
        messageId: message.id,
        channelId: message.channelId,
        code: error?.code,
        message: error?.message
      });
    });
  }
}

export async function addAutoReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const trigger = interaction.options.getString('word', true).trim();
  const replyText = interaction.options.getString('reply', true).trim();

  if (!trigger || !replyText) {
    await reply(interaction, 'Invalid Rule', 'Word and reply cannot be empty.');
    return;
  }

  const rule = await addAutoReplyRule({
    id: `word:${slug(trigger)}`,
    guildId: interaction.guildId,
    type: 'text',
    trigger,
    reply: replyText,
    createdBy: interaction.user.id,
    createdAt: Date.now()
  });

  await reply(interaction, 'Auto Reply Saved', `Rule ID: \`${rule.id}\`\nWord: \`${trigger}\`\nReply: ${replyText}`);
}

export async function addStickerAutoReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const trigger = interaction.options.getString('word', true).trim();
  const stickerId = interaction.options.getString('sticker_id', true).trim();

  if (!trigger || !/^\d{15,25}$/.test(stickerId)) {
    await reply(interaction, 'Invalid Rule', 'Word cannot be empty and sticker ID must be a valid numeric ID.');
    return;
  }

  const rule = await addAutoReplyRule({
    id: `sticker:${slug(trigger)}`,
    guildId: interaction.guildId,
    type: 'sticker',
    trigger,
    stickerId,
    createdBy: interaction.user.id,
    createdAt: Date.now()
  });

  await reply(interaction, 'Sticker Auto Reply Saved', `Rule ID: \`${rule.id}\`\nWord: \`${trigger}\`\nSticker ID: \`${stickerId}\``);
}

export async function listAutoRepliesReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const rules = await listAutoReplyRules(interaction.guildId);
  if (!rules.length) {
    await reply(interaction, 'Auto Replies', 'No auto replies are saved for this server.');
    return;
  }

  const lines = rules.map((rule, index) => {
    const value = formatRuleValue(rule);
    return `**${index + 1}.** \`${rule.id}\` - \`${rule.trigger}\` -> ${value}`;
  });

  await reply(interaction, 'Auto Replies', lines.join('\n'));
}

export async function removeAutoReplyReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const id = interaction.options.getString('id', true).trim();
  const removed = await removeAutoReplyRule(interaction.guildId, id);

  await reply(
    interaction,
    removed ? 'Auto Reply Removed' : 'Rule Not Found',
    removed ? `Removed rule \`${id}\`.` : `No rule found with ID \`${id}\`.`
  );
}

export async function whitelistAutoReplyUser(interaction) {
  if (!(await assertOwner(interaction))) return;

  const user = interaction.options.getUser('user', true);
  await addAutoReplyWhitelistUser(interaction.guildId, user.id);
  await reply(interaction, 'Auto Reply Whitelist', `<@${user.id}> will not trigger auto replies anymore.`);
}

export async function unwhitelistAutoReplyUser(interaction) {
  if (!(await assertOwner(interaction))) return;

  const user = interaction.options.getUser('user', true);
  const removed = await removeAutoReplyWhitelistUser(interaction.guildId, user.id);
  await reply(
    interaction,
    removed ? 'Auto Reply Whitelist' : 'User Not Found',
    removed ? `<@${user.id}> can trigger auto replies again.` : `<@${user.id}> was not whitelisted.`
  );
}

export async function listAutoReplyWhitelistReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const whitelist = await listAutoReplyWhitelist(interaction.guildId);
  if (!whitelist.length) {
    await reply(interaction, 'Auto Reply Whitelist', 'No users are whitelisted.');
    return;
  }

  await reply(
    interaction,
    'Auto Reply Whitelist',
    whitelist.map((item, index) => `**${index + 1}.** <@${item.userId}>`).join('\n')
  );
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'trigger';
}

function buildAutoReplyPayload(rule) {
  if (rule.type === 'sticker') {
    return {
      stickers: [rule.stickerId],
      allowedMentions: { parse: [] }
    };
  }

  return {
    content: rule.reply,
    allowedMentions: { parse: [] }
  };
}

function formatRuleValue(rule) {
  if (rule.type === 'sticker') return `Sticker \`${rule.stickerId}\``;
  const text = rule.reply ?? '';
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function matchesTrigger(content, trigger) {
  return normalizeForMatch(content).includes(normalizeForMatch(trigger));
}

function normalizeForMatch(value) {
  return String(value ?? '').trim().toLowerCase();
}

async function assertOwner(interaction) {
  if (isBotOwner(interaction.user.id)) return true;
  await reply(interaction, 'Owner Only', 'Only the bot owner can use this command.');
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
