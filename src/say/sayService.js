import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js';
import { config } from '../config.js';

const MAX_TEXT_DISPLAY_LENGTH = 4_000;
const MAX_SEPARATORS = 19;

function rawSayContent(message) {
  if (!message.content.startsWith(config.prefix)) return null;
  const withoutPrefix = message.content.slice(config.prefix.length);
  const command = /^say(?=$|[\t\n\r ])/i.exec(withoutPrefix);
  if (!command) return null;

  let content = withoutPrefix.slice(command[0].length);
  if (content.startsWith('\r\n')) content = content.slice(2);
  else if (/^[\t\n\r ]/.test(content)) content = content.slice(1);
  return content;
}

function sayPayload(content) {
  const parts = String(content).split(/\{separator\}/gi);
  if (parts.length - 1 > MAX_SEPARATORS) return null;

  const container = new ContainerBuilder();
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(parts[index]));
    }
    if (index < parts.length - 1) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
    }
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  };
}

export async function handleSayPrefix(message) {
  if (!message.inGuild() || message.author.bot) return false;
  const content = rawSayContent(message);
  if (content === null) return false;
  if (!config.developerIds.includes(message.author.id)) return true;

  if (!content.length) {
    await message.channel.send(sayPayload('Provide text after the say command.'));
    return true;
  }
  if (content.length > MAX_TEXT_DISPLAY_LENGTH) {
    await message.channel.send(sayPayload(`The message is too long. Maximum length is ${MAX_TEXT_DISPLAY_LENGTH} characters.`));
    return true;
  }

  const payload = sayPayload(content);
  if (!payload) {
    await message.channel.send(sayPayload(`You can use a maximum of ${MAX_SEPARATORS} \`{separator}\` placeholders.`));
    return true;
  }

  await message.channel.send(payload);
  return true;
}
