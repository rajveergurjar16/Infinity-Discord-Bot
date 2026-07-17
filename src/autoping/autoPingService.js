import { getAutoPingConfig } from './autoPingStore.js';

const DELETE_DELAY_MS = 750;

export async function handleAutoPingMemberJoin(member) {
  if (!member?.guild || member.user?.bot) return;

  const setting = await getAutoPingConfig(member.guild.id);
  if (!setting?.channelId) return;

  const channel = member.guild.channels.cache.get(setting.channelId)
    || await member.guild.channels.fetch(setting.channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.isSendable?.()) return;

  const ping = await channel.send({
    content: `Welcome!! <@${member.id}>`,
    allowedMentions: {
      parse: [],
      users: [member.id],
      repliedUser: false
    }
  });

  setTimeout(() => {
    ping.delete().catch((error) => {
      if (error?.code !== 10008) console.error('Auto-ping cleanup error:', error);
    });
  }, DELETE_DELAY_MS).unref?.();
}
