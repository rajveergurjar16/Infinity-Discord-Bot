import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from 'discord.js';
import {
  listGiveaways,
  getGiveaway,
  pruneGiveaways,
  removeGiveaway,
  upsertGiveaway
} from './giveawayStore.js';

const GIVEAWAY_EMOJI = '<a:NEON_GIFT:1525867969052151950>';
const TITLE_GIFT_EMOJI = '<:pink_gift:1525872374958915724>';
const DOT_EMOJI = '<:dot:1525851013356195850>';
const CELEBRATE_EMOJI = '<a:popper:1525868148799311915>';
const CELEBRATE_EMOJI_ID = '1525868148799311915';
const MAX_TIMEOUT_MS = 2_147_000_000;
const GIVEAWAY_COLOR = '#5ce1e6';
const ENDED_GIVEAWAY_RETENTION_MS = 12 * 60 * 60 * 1000;
const BLANK_LINE = '\u200b';

const timers = new Map();

async function safeDefer(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferReply({ flags: 64 });
    return true;
  } catch (error) {
    if (error?.code !== 10062) throw error;
    return false;
  }
}

async function safeDeleteReply(interaction) {
  if (!interaction.deferred && !interaction.replied) return;
  await interaction.deleteReply().catch(() => {});
}

async function safeEditReply(interaction, content) {
  if (!interaction.deferred && !interaction.replied) return;
  await interaction.editReply({ content }).catch(() => {});
}

function parseDuration(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return null;

  const clock = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (clock) {
    const target = new Date();
    target.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
    if (target.getTime() <= Date.now()) target.setDate(target.getDate() + 1);
    return target.getTime() - Date.now();
  }

  const matches = [...value.matchAll(/(\d+)\s*(d|h|m|s)/g)];
  if (!matches.length) return null;

  const total = matches.reduce((sum, match) => {
    const amount = Number(match[1]);
    if (match[2] === 'd') return sum + amount * 86400000;
    if (match[2] === 'h') return sum + amount * 3600000;
    if (match[2] === 'm') return sum + amount * 60000;
    return sum + amount * 1000;
  }, 0);

  return total > 0 ? total : null;
}

function timestamp(ms) {
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:f>(<t:${unix}:R>)`;
}

function winnerWord(count) {
  return count === 1 ? 'Winner' : 'Winners';
}

function mentionUsers(userIds) {
  return userIds.length ? userIds.map((id) => `<@${id}>`).join(' ') : 'No winners';
}

function buildGiveawayEmbed(giveaway, guild = null) {
  let body;

  if (giveaway.status === 'cancelled') {
    body = [
      giveaway.description,
      BLANK_LINE,
      `${DOT_EMOJI} Cancelled By - <@${giveaway.cancelledBy}>`,
      `${DOT_EMOJI} Reason - ${giveaway.cancelReason || 'No reason provided'}`,
      `${DOT_EMOJI} Hosted By - <@${giveaway.hostId}>`
    ];
  } else if (giveaway.status === 'ended') {
    body = [
      giveaway.description,
      BLANK_LINE,
      `${DOT_EMOJI} ${winnerWord(giveaway.winnerIds.length || giveaway.winners)} - ${mentionUsers(giveaway.winnerIds)}`,
      `${DOT_EMOJI} Ended - ${timestamp(giveaway.endedAt)}`,
      `${DOT_EMOJI} Hosted By - <@${giveaway.hostId}>`
    ];
  } else {
    body = [
      giveaway.description,
      BLANK_LINE,
      `${DOT_EMOJI} ${winnerWord(giveaway.winners)} - ${giveaway.winners}`,
      `${DOT_EMOJI} Ending in - ${timestamp(giveaway.endsAt)}`,
      `${DOT_EMOJI} Hosted By - <@${giveaway.hostId}>`,
      BLANK_LINE,
      `${DOT_EMOJI} React With ${CELEBRATE_EMOJI} to participate`
    ];
  }

  const embed = new EmbedBuilder()
    .setTitle(`${TITLE_GIFT_EMOJI} ${giveaway.prize} ${TITLE_GIFT_EMOJI}`)
    .setColor(GIVEAWAY_COLOR)
    .setDescription(body.filter(Boolean).join('\n'));

  if (guild) {
    embed.setFooter({
      text: guild.name,
      iconURL: guild.iconURL({ size: 128 }) ?? undefined
    });
  }

  return embed;
}

function giveawayHeader(giveaway) {
  if (giveaway.status === 'cancelled') {
    return `${GIVEAWAY_EMOJI} Giveaway Cancelled ${GIVEAWAY_EMOJI}`;
  }

  if (giveaway.status === 'ended') {
    return `${GIVEAWAY_EMOJI} Giveaway Ended ${GIVEAWAY_EMOJI}`;
  }

  return `${GIVEAWAY_EMOJI} New Giveaway ${GIVEAWAY_EMOJI}`;
}

function giveawayPayload(giveaway, guild = null) {
  return {
    content: giveawayHeader(giveaway),
    embeds: [buildGiveawayEmbed(giveaway, guild)]
  };
}

function linkButton(giveaway) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Giveaway Link')
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${giveaway.guildId}/${giveaway.channelId}/${giveaway.messageId}`)
  );
}

async function fetchGiveawayMessage(client, giveaway) {
  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased()) return null;
  return channel.messages.fetch(giveaway.messageId).catch(() => null);
}

async function fetchParticipants(client, giveaway) {
  const message = await fetchGiveawayMessage(client, giveaway);
  if (!message) return [];

  const reaction = message.reactions.cache.get(CELEBRATE_EMOJI_ID) ??
    message.reactions.cache.find((item) => item.emoji.id === CELEBRATE_EMOJI_ID);
  if (!reaction) return [];

  const users = await reaction.users.fetch();
  return [...users.values()]
    .filter((user) => !user.bot)
    .map((user) => user.id);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickRandomWinners(userIds, count, excluded = []) {
  const excludedSet = new Set(excluded);
  const unique = [...new Set(userIds)].filter((id) => !excludedSet.has(id));
  return shuffle(unique).slice(0, count);
}

function parseUserIds(input) {
  return [...String(input || '').matchAll(/\d{15,25}/g)].map((match) => match[0]);
}

async function editGiveawayMessage(client, giveaway) {
  const message = await fetchGiveawayMessage(client, giveaway);
  if (message) {
    await message.edit(giveawayPayload(giveaway, message.guild));
  }

  return message;
}

async function announceWinners(client, giveaway, reroll = false) {
  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  if (!giveaway.winnerIds.length) {
    await channel.send({
      content: `No valid winners for **${giveaway.prize}**, Hosted By <@${giveaway.hostId}>`,
      components: [linkButton(giveaway)]
    });
    return;
  }

  const winnerText = mentionUsers(giveaway.winnerIds);
  const content = reroll
    ? `Congratulations ${winnerText} You are the new ${winnerWord(giveaway.winnerIds.length).toLowerCase()} for **${giveaway.prize}**, Hosted By <@${giveaway.hostId}>`
    : `Congratulations ${winnerText} You have won **${giveaway.prize}**, Hosted By <@${giveaway.hostId}>`;

  await channel.send({
    content,
    components: [linkButton(giveaway)]
  });
}

export async function startGiveaway(interaction) {
  await safeDefer(interaction);

  const prize = interaction.options.getString('prize', true);
  const winners = interaction.options.getInteger('winners', true);
  const durationInput = interaction.options.getString('duration', true);
  const targetChannel = interaction.options.getChannel('channel') ?? interaction.channel;
  const durationMs = parseDuration(durationInput);

  if (!durationMs) {
    await safeEditReply(interaction, 'Invalid duration. Use `1m`, `1h`, `2d`, or `21:16`.');
    return;
  }

  const giveaway = {
    id: null,
    guildId: interaction.guildId,
    channelId: targetChannel.id,
    messageId: null,
    prize,
    description: '',
    winners,
    hostId: interaction.user.id,
    status: 'active',
    winnerIds: [],
    startedAt: Date.now(),
    endsAt: Date.now() + durationMs,
    endedAt: null,
    cancelledBy: null,
    cancelReason: null
  };

  const message = await targetChannel.send(giveawayPayload(giveaway, interaction.guild));
  await message.react(CELEBRATE_EMOJI_ID);

  giveaway.id = message.id;
  giveaway.messageId = message.id;
  await upsertGiveaway(giveaway);
  scheduleGiveaway(interaction.client, giveaway);
  await safeDeleteReply(interaction);
}

export async function endGiveaway(client, messageId) {
  const giveaway = await getGiveaway(messageId);
  if (!giveaway || giveaway.status !== 'active') return null;

  const sourceMessage = await fetchGiveawayMessage(client, giveaway);
  if (!sourceMessage) {
    clearGiveawayTimer(giveaway.id);
    await removeGiveaway(giveaway.id);
    return null;
  }

  const participants = await fetchParticipants(client, giveaway);
  giveaway.winnerIds = pickRandomWinners(participants, giveaway.winners);
  giveaway.status = 'ended';
  giveaway.endedAt = Date.now();

  await upsertGiveaway(giveaway);
  clearGiveawayTimer(giveaway.id);
  await editGiveawayMessage(client, giveaway);
  await announceWinners(client, giveaway);
  await cleanupOldGiveaways();
  return giveaway;
}

export async function manualEndGiveaway(interaction) {
  await safeDefer(interaction);
  await endGiveaway(interaction.client, interaction.options.getString('message_id', true));
  await safeDeleteReply(interaction);
}

export async function rerollGiveaway(interaction) {
  await safeDefer(interaction);
  const messageId = interaction.options.getString('message_id', true);
  const targetUserIds = parseUserIds(interaction.options.getString('users'));
  const giveaway = await getGiveaway(messageId);

  if (!giveaway || giveaway.status !== 'ended') {
    await safeDeleteReply(interaction);
    return;
  }

  const sourceMessage = await fetchGiveawayMessage(interaction.client, giveaway);
  if (!sourceMessage) {
    await removeGiveaway(giveaway.id);
    await safeDeleteReply(interaction);
    return;
  }

  const participants = await fetchParticipants(interaction.client, giveaway);
  const replaceCount = targetUserIds.length || giveaway.winners;
  const keepWinners = targetUserIds.length
    ? giveaway.winnerIds.filter((id) => !targetUserIds.includes(id))
    : [];
  const excluded = targetUserIds.length ? giveaway.winnerIds : [];
  const newWinners = pickRandomWinners(participants, replaceCount, excluded);

  giveaway.winnerIds = [...keepWinners, ...newWinners].slice(0, giveaway.winners);
  giveaway.endedAt = Date.now();

  await upsertGiveaway(giveaway);
  await editGiveawayMessage(interaction.client, giveaway);
  await announceWinners(interaction.client, giveaway, true);
  await safeDeleteReply(interaction);
}

export async function cancelGiveaway(interaction) {
  await safeDefer(interaction);
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const giveaway = await getGiveaway(interaction.options.getString('message_id', true));

  if (giveaway) {
    const sourceMessage = await fetchGiveawayMessage(interaction.client, giveaway);
    if (!sourceMessage) {
      clearGiveawayTimer(giveaway.id);
      await removeGiveaway(giveaway.id);
      await safeDeleteReply(interaction);
      return;
    }

    giveaway.status = 'cancelled';
    giveaway.cancelledBy = interaction.user.id;
    giveaway.cancelReason = reason;
    giveaway.endedAt = Date.now();
    await upsertGiveaway(giveaway);
    clearGiveawayTimer(giveaway.id);
    await editGiveawayMessage(interaction.client, giveaway);
    await cleanupOldGiveaways();
  }

  await safeDeleteReply(interaction);
}

export async function listGiveawaysReply(interaction) {
  const giveaways = (await listGiveaways())
    .filter((giveaway) => giveaway.guildId === interaction.guildId && giveaway.status === 'active')
    .sort((a, b) => a.endsAt - b.endsAt);

  const body = giveaways.length
    ? giveaways
        .slice(0, 20)
        .map((giveaway) => {
          const channel = `<#${giveaway.channelId}>`;
          return `\`${giveaway.messageId}\` - **${giveaway.prize}** in ${channel} ends ${timestamp(giveaway.endsAt)}`;
        })
        .join('\n')
    : 'No active giveaways in this server.';

  await interaction.reply({
    content: body,
    flags: 64
  });
}

function clearGiveawayTimer(id) {
  if (timers.has(id)) clearTimeout(timers.get(id));
  timers.delete(id);
}

export function scheduleGiveaway(client, giveaway) {
  clearGiveawayTimer(giveaway.id);
  if (giveaway.status !== 'active') return;

  const delay = giveaway.endsAt - Date.now();
  const timeout = setTimeout(() => {
    if (delay > MAX_TIMEOUT_MS) {
      scheduleGiveaway(client, giveaway);
      return;
    }
    endGiveaway(client, giveaway.messageId).catch((error) => {
      console.error('Giveaway auto-end error:', error);
    });
  }, Math.max(1000, Math.min(delay, MAX_TIMEOUT_MS)));

  timers.set(giveaway.id, timeout);
}

export async function scheduleActiveGiveaways(client) {
  await cleanupOldGiveaways();
  const giveaways = await listGiveaways();
  for (const giveaway of giveaways.filter((item) => item.status === 'active')) {
    if (giveaway.endsAt <= Date.now()) {
      await endGiveaway(client, giveaway.messageId).catch((error) => {
        console.error('Giveaway startup end error:', error);
      });
    } else {
      scheduleGiveaway(client, giveaway);
    }
  }
}

async function cleanupOldGiveaways() {
  await pruneGiveaways({
    endedBefore: Date.now() - ENDED_GIVEAWAY_RETENTION_MS
  });
}
