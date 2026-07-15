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

## Bot Status

Deploy the command once. Server admins can configure or update monitored bots at runtime:

```text
/statuslog add client_id:FROGGY_CLIENT_ID api_url:http://FROGGY_SERVER_IP:3210/api/status api_key:FROGGY_STATUS_API_KEY channel:#bot-status pinguser:@Status Alerts
/statuslog remove client_id:FROGGY_CLIENT_ID
```

Infinity resolves the monitored bot's server display name and logo from its Discord client ID. Animated Discord avatars remain GIFs; static avatars use lossless PNG. It checks each configured API every second with a 900ms request timeout. Three consecutive non-online checks are required before an Offline alert, preventing a single network hiccup from creating a false alert. The first successful check after an outage sends the Online recovery alert. The optional `pinguser` value is shown below the alert and may contain normal text, user mentions, role mentions, `@everyone`, `@here`, or a mixture. Registry changes are saved in `data/status-bots.json` and take effect immediately without editing `.env` or restarting Infinity. Reusing the same client ID updates its endpoint, key, channel, notification text, display identity, and current baseline.

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

If the replied message has multiple emojis/stickers, choose the source from the selector first. The command is available to members with Discord's Create Guild Expressions or Manage Guild Expressions permission.
