import {
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder
} from 'discord.js';
import {
  closeConfirmContainer,
  cv2Flags,
  privateCv2Flags,
  simpleContainer,
  ticketClosedContainer,
  ticketContainer
} from '../ui/cv2.js';
import { getTicketSettings, isTicketReady } from './ticketSettings.js';
import { createTranscript } from './transcripts.js';

function findType(typeId, settings) {
  return settings.types.find((type) => type.id === typeId);
}

function isTicketChannel(channel) {
  return channel?.type === ChannelType.GuildText && channel.topic?.startsWith('ticket-owner:');
}

function getTicketOwnerId(channel) {
  return channel.topic?.match(/ticket-owner:(\d+)/)?.[1] ?? null;
}

function getTicketMeta(channel) {
  const topic = channel.topic ?? '';

  return {
    ownerId: topic.match(/ticket-owner:(\d+)/)?.[1] ?? null,
    typeId: topic.match(/type:([a-z0-9_-]+)/)?.[1] ?? null,
    claimedBy: topic.match(/claimed-by:(\d+|none)/)?.[1] ?? 'none',
    openedAt: topic.match(/opened-at:(\d+)/)?.[1] ?? null
  };
}

function ticketTopic({ ownerId, typeId, claimedBy = 'none', openedAt }) {
  return `ticket-owner:${ownerId};type:${typeId};claimed-by:${claimedBy};opened-at:${openedAt}`;
}

function canManageTicket(interaction, settings) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;

  return settings.staffRoleIds.some((roleId) => interaction.member.roles.cache.has(roleId));
}

function ticketChannelName(user) {
  const username = user.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return `ticket-${username || user.id}`;
}

export async function createTicket(interaction) {
  const settings = await getTicketSettings();
  const typeId = interaction.values[0];
  const type = findType(typeId, settings);

  if (!isTicketReady(settings)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Ticket System Not Ready', 'Staff needs to finish `/ticket panel` first.')]
    });
    return;
  }

  if (!type) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Ticket Error', 'This ticket type is not available right now.')]
    });
    return;
  }

  const existing = interaction.guild.channels.cache.find(
    (channel) => isTicketChannel(channel) && getTicketOwnerId(channel) === interaction.user.id
  );

  if (existing) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Ticket Already Open', `You already have an open ticket: ${existing}`)]
    });
    return;
  }

  await interaction.deferReply({ flags: privateCv2Flags });

  const permissionOverwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles
      ]
    },
    ...settings.staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages
      ]
    }))
  ];

  const channel = await interaction.guild.channels.create({
    name: ticketChannelName(interaction.user),
    type: ChannelType.GuildText,
    parent: settings.categoryId,
    topic: ticketTopic({
      ownerId: interaction.user.id,
      typeId: type.id,
      openedAt: Date.now()
    }),
    permissionOverwrites
  });

  await channel.send({
    content: [`<@${interaction.user.id}>`, ...settings.staffRoleIds.map((roleId) => `<@&${roleId}>`)].join(' '),
    allowedMentions: {
      users: [interaction.user.id],
      roles: settings.staffRoleIds
    }
  });

  await channel.send({
    flags: cv2Flags,
    components: [ticketContainer({ category: type })]
  });

  await interaction.editReply({
    flags: privateCv2Flags,
    components: [simpleContainer('Ticket Created', `Your private ticket is ready: ${channel}`)]
  });
}

export async function claimTicket(interaction) {
  if (!isTicketChannel(interaction.channel)) return;

  const settings = await getTicketSettings();

  if (!canManageTicket(interaction, settings)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('Staff Only', 'Only support staff can claim tickets.')]
    });
    return;
  }

  const meta = getTicketMeta(interaction.channel);
  const ownerId = meta.ownerId;
  const typeId = meta.typeId ?? settings.types[0]?.id;
  const type = findType(typeId, settings) ?? settings.types[0];

  await interaction.channel.setTopic(
    ticketTopic({
      ownerId,
      typeId: type.id,
      claimedBy: interaction.user.id,
      openedAt: meta.openedAt ?? Date.now()
    })
  );
  await interaction.update({
    components: [
      ticketContainer({
        category: type,
        claimedBy: interaction.user.id
      })
    ]
  });

  await interaction.channel.send({
    flags: cv2Flags,
    components: [simpleContainer('Ticket Claimed', `Claimed by <@${interaction.user.id}>.`)]
  });
}

export async function requestCloseTicket(interaction) {
  if (!isTicketChannel(interaction.channel)) return;

  const meta = getTicketMeta(interaction.channel);
  const ownerId = meta.ownerId;
  const isOwner = ownerId === interaction.user.id;
  const settings = await getTicketSettings();

  if (!isOwner && !canManageTicket(interaction, settings)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('No Access', 'Only the ticket owner or staff can close this ticket.')]
    });
    return;
  }

  await interaction.reply({
    flags: privateCv2Flags,
    components: [closeConfirmContainer()]
  });
}

export async function cancelCloseTicket(interaction) {
  await interaction.update({
    components: [simpleContainer('Close Cancelled', 'This ticket will stay open.')]
  });
}

export async function closeTicket(interaction) {
  if (!isTicketChannel(interaction.channel)) return;

  const meta = getTicketMeta(interaction.channel);
  const ownerId = meta.ownerId ?? getTicketOwnerId(interaction.channel);
  const isOwner = ownerId === interaction.user.id;
  const settings = await getTicketSettings();

  if (!isOwner && !canManageTicket(interaction, settings)) {
    await interaction.reply({
      flags: privateCv2Flags,
      components: [simpleContainer('No Access', 'Only the ticket owner or staff can close this ticket.')]
    });
    return;
  }

  await interaction.update({
    components: [ticketClosedContainer({ closedBy: interaction.user })]
  });

  const transcript = await createTranscript(interaction.channel);
  const logChannel = await interaction.guild.channels.fetch(settings.logChannelId);
  const type = findType(meta.typeId, settings);
  const openedTimestamp = meta.openedAt ? Math.floor(Number(meta.openedAt) / 1000) : null;
  const closedTimestamp = Math.floor(Date.now() / 1000);
  const claimedBy = meta.claimedBy && meta.claimedBy !== 'none' ? `<@${meta.claimedBy}>` : 'Not claimed';

  if (logChannel?.isTextBased()) {
    const summary = [
      `Channel: #${interaction.channel.name}`,
      `Owner: <@${ownerId}> (${ownerId})`,
      `Reason: ${type ? `${type.emoji ? `${type.emoji} ` : ''}${type.label}` : meta.typeId ?? 'Unknown'}`,
      `Claimed by: ${claimedBy}`,
      `Closed by: <@${interaction.user.id}> (${interaction.user.id})`,
      `Opened: ${openedTimestamp ? `<t:${openedTimestamp}:F>` : 'Unknown'}`,
      `Closed: <t:${closedTimestamp}:F>`,
      `Messages saved: ${transcript.messageCount}`,
      'Chat transcript file is attached below.'
    ].join('\n');

    await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('Ticket Transcript')
          .setDescription(summary)
          .setColor(0x2b2d31)
          .setTimestamp()
      ],
      files: [new AttachmentBuilder(transcript.filePath)]
    });
  }

  setTimeout(() => {
    interaction.channel.delete('Ticket closed').catch(() => {});
  }, 5000);
}
