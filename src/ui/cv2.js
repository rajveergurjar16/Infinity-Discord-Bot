import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder
} from 'discord.js';

export const cv2Flags = MessageFlags.IsComponentsV2;
export const privateCv2Flags = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

export function text(content) {
  return new TextDisplayBuilder().setContent(content);
}

export function separator() {
  return new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small);
}

export function panelContainer({ settings }) {
  const options = settings.types.map((type) => ({
    label: type.label,
    description: type.description,
    value: type.id,
    emoji: type.emoji || undefined
  }));

  const container = new ContainerBuilder();

  if (settings.thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(text(`# ${settings.panelTitle}\n${settings.panelDescription}`))
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(settings.thumbnailUrl))
    );
  } else {
    container.addTextDisplayComponents(text(`# ${settings.panelTitle}\n${settings.panelDescription}`));
  }

  if (settings.imageUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(settings.imageUrl)
      )
    );
  }

  return container
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:create')
          .setPlaceholder('Choose a support type')
          .addOptions(options)
      )
    );
}

export function ticketContainer({ category, claimedBy }) {
  return new ContainerBuilder()
    .addTextDisplayComponents(
      text(
        [
          '### __Ticket Opened__',
          'Thank you for opening a ticket. Our Staff will be with you shortly.',
          '',
          '> Reason:',
          `> ${category.emoji ? `${category.emoji} ` : ''}${category.label}`,
          claimedBy ? `\nClaimed by: <@${claimedBy}>` : ''
        ].join('\n')
      )
    )
    .addSeparatorComponents(separator())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:claim')
          .setLabel(claimedBy ? 'Claimed' : 'Claim')
          .setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary)
          .setDisabled(Boolean(claimedBy)),
        new ButtonBuilder()
          .setCustomId('ticket:close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
      )
    );
}

export function ticketClosedContainer({ closedBy }) {
  return new ContainerBuilder().addTextDisplayComponents(
    text(`# Ticket Closed\nClosed by: <@${closedBy.id}>\nTranscript has been saved in the staff logs.`)
  );
}

export function closeConfirmContainer() {
  return new ContainerBuilder()
    .addTextDisplayComponents(text('## Close Ticket?\nConfirm only when this support request is finished.'))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:close_confirm')
          .setLabel('Confirm Close')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket:close_cancel')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      )
    );
}

export function simpleContainer(title, body) {
  return new ContainerBuilder().addTextDisplayComponents(text(`## ${title}\n${body}`));
}

export function messageContainer(body) {
  return new ContainerBuilder().addTextDisplayComponents(text(body));
}
