import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  guildId: required('GUILD_ID'),
  prefix: process.env.PREFIX || '?',
  ownerIds: (process.env.OWNER_IDS || process.env.OWNER_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  developerIds: [
    ...(process.env.OWNER_IDS || process.env.OWNER_ID || '').split(','),
    ...(process.env.DEVELOPER_IDS || '').split(',')
  ]
    .map((id) => id.trim())
    .filter(Boolean)
};
