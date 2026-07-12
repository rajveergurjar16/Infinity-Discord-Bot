import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function createTranscript(channel) {
  const ordered = await fetchAllMessages(channel);

  const lines = ordered.map((message) => {
    const createdAt = message.createdAt.toISOString();
    const author = `${message.author.tag} (${message.author.id})`;
    const content = message.content || '[no text content]';
    const attachments = [...message.attachments.values()].map((attachment) => attachment.url);
    const embeds = message.embeds.length ? `\nEmbeds: ${message.embeds.length}` : '';
    const components = message.components.length ? `\nComponents: ${message.components.length}` : '';
    const attachmentText = attachments.length ? `\nAttachments: ${attachments.join(', ')}` : '';
    return `[${createdAt}] ${author}: ${content}${attachmentText}${embeds}${components}`;
  });

  await mkdir('transcripts', { recursive: true });

  const fileName = `${channel.name}-${Date.now()}.txt`.replace(/[^a-z0-9_.-]/gi, '-');
  const filePath = path.resolve('transcripts', fileName);

  await writeFile(filePath, lines.join('\n\n'), 'utf8');

  return {
    filePath,
    messageCount: ordered.length,
    firstMessageAt: ordered[0]?.createdAt ?? null,
    lastMessageAt: ordered.at(-1)?.createdAt ?? null
  };
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;

    messages.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  return messages.reverse();
}
