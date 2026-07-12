import { isBotOwner } from '../autoreact/autoReactService.js';
import { cv2Flags, messageContainer, privateCv2Flags, simpleContainer } from '../ui/cv2.js';
import {
  addAutoReplyRule,
  listAutoReplyRules,
  removeAutoReplyRule
} from './autoReplyStore.js';

export async function handleAutoReplyMessage(message) {
  if (!message.guild || message.author.bot || message.system || message.webhookId) return;

  const content = message.content?.toLowerCase();
  if (!content) return;

  const rules = await listAutoReplyRules(message.guild.id);
  if (!rules.length) return;

  const matchedReplies = [];
  for (const rule of rules) {
    if (content.includes(rule.trigger.toLowerCase())) {
      matchedReplies.push(rule.reply);
    }
  }

  for (const reply of matchedReplies) {
    await message.channel.send({
      flags: cv2Flags,
      components: [messageContainer(reply)],
      allowedMentions: { parse: [] }
    }).catch((error) => {
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
    trigger,
    reply: replyText,
    createdBy: interaction.user.id,
    createdAt: Date.now()
  });

  await reply(interaction, 'Auto Reply Saved', `Rule ID: \`${rule.id}\`\nWord: \`${trigger}\`\nReply: ${replyText}`);
}

export async function listAutoRepliesReply(interaction) {
  if (!(await assertOwner(interaction))) return;

  const rules = await listAutoReplyRules(interaction.guildId);
  if (!rules.length) {
    await reply(interaction, 'Auto Replies', 'No auto replies are saved for this server.');
    return;
  }

  const lines = rules.map((rule, index) => {
    const shortReply = rule.reply.length > 80 ? `${rule.reply.slice(0, 77)}...` : rule.reply;
    return `**${index + 1}.** \`${rule.id}\` - \`${rule.trigger}\` -> ${shortReply}`;
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

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'trigger';
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
