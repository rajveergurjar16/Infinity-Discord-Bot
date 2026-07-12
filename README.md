# Infinity Official

Server manager bot for the Infinity support server.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill:

```env
DISCORD_TOKEN=your_bot_token
CLIENT_ID=your_application_id
GUILD_ID=your_server_id
```

3. Deploy slash commands:

```bash
npm run deploy
```

4. Start the bot:

```bash
npm start
```

## Ticket Panel Editor

Use this command in Discord:

```text
/ticket panel
```

It opens a live embed preview with:

- text editor: title, description, author text, footer text, embed color
- image editor: author icon, top thumbnail, bottom thumbnail, large image, footer icon
- ticket type creator with normal emoji or custom emoji support
- ticket open category selector
- ticket panel channel selector
- transcript channel selector
- staff role selector
- Send Panel and Cancel buttons

Ticket settings are saved in `data/ticket-settings.json`.

## Bot Status Panel

Use this command in Discord:

```text
/status panel
```

It opens a live CV2 dashboard editor with:

- text editor: title, description, auto-refresh interval
- add/remove bot using a status API URL and icon URL
- panel channel selector
- manual channel ID fallback
- Send Panel / Update Panel and Cancel buttons
- public refresh button

Status settings are saved in `data/status-settings.json`.

The status API should respond when the bot is online. Optional JSON fields:

```json
{
  "online": true,
  "onlineSince": "2026-07-11T10:00:00.000Z",
  "uptime": "99.98%",
  "iconUrl": "https://example.com/icon.png"
}
```

## Giveaway System

Use these commands in Discord:

```text
/giveaway start prize:Prize winners:1 duration:1h
/giveaway end message_id:message_id
/giveaway reroll message_id:message_id users:@user1 123456789012345678
/giveaway cancel reason:reason
```

The giveaway system is reaction based:

- users enter by reacting with `<a:popper:1525868148799311915>`
- the bot keeps reactions on ended/cancelled giveaways
- winners are picked from reaction users
- persistent auto-end after restart

Giveaways are saved in `data/giveaways.json`.

## Steal Prefix Command

Reply to a message with a custom emoji or sticker:

```text
>>steal
```

The bot shows:

- Steal as Emoji
- Steal as Sticker

If the replied message has multiple emojis/stickers, choose the source from the selector first.
