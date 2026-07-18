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
OWNER_IDS=your_discord_user_id
DEVELOPER_IDS=developer_id_1,developer_id_2
PREFIX=?
```

3. Deploy slash commands:

```bash
npm run deploy
```

4. Start the bot:

```bash
npm start
```

Enable **Server Members Intent** for the bot in Discord Developer Portal so member-join automation can receive join events.

## New Member Auto-Ping

Members with **Manage Server** can configure a temporary mention for every new member:

```text
/autoping channel:#register-here
/autoping disable:true
```

Each member receives a separate `Welcome!! @user` mention. The ping message is automatically deleted shortly after it is sent, while Discord may retain the mention notification or unread badge according to the recipient's client and notification settings. Settings are saved per server in `data/auto-ping.json`.

## Auto Reactions

Running `/autoreact channel` or `/autoreact text` more than once for the same
channel/text adds another emoji instead of replacing the existing one. Reusing
the exact same target and emoji updates that rule without creating a duplicate.
Each emoji has its own rule ID and can be removed independently.

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
Running `/ticket panel` again reloads the saved setup. The final button becomes
**Update Panel** after deployment and edits the existing public panel instead of
creating a duplicate. You can add or remove ticket types at any time.

## Developer Say Command

Developers and owners can send an exact public Components v2 message:

```text
?say Your text with exact spaces and line breaks
```

Use `{separator}` inside the text to insert a small divider.

## Bot Invite Dashboard

Bot owners can add or update applications in a persistent invite dashboard:

```text
/invite user_id:BOT_USER_ID permissions:PERMISSION_INTEGER channel:#bot-invites
```

The command validates the bot ID and permission bitfield, then creates or updates
one combined dashboard. Each entry contains an **Add App** button. Discord does
not expose a reliable way to infer every permission a bot's code actually needs,
so use the permission integer chosen for that application.

## Admin Reminder System

Only members with Discord's **Administrator** permission can create, edit,
cancel, acknowledge, snooze, or inspect reminders.

```text
/reminder create title:Renew VPS when:20-07-2026 17:00 channel:#important-work ping:@Admins repeat:Monthly priority:Critical
/reminder list
/reminder edit id:REMINDER_ID
/reminder cancel id:REMINDER_ID
/reminder panel channel:#important-work
```

Relative times (`10m`, `2h`, `3d`, `1w`) and absolute IST dates
(`DD-MM-YYYY HH:mm` or `YYYY-MM-DD HH:mm`) are supported. Creation first shows
an ephemeral Confirm/Edit/Cancel preview. Due reminders are delivered publicly
with Mark Done, Snooze 10m, Snooze 1h, Tomorrow, and Cancel buttons. Important
reminders re-ping once after 15 minutes; critical reminders re-ping after 10 and
30 minutes. State is saved in `data/reminders.json`, missed reminders recover
after restart, recurring reminders advance automatically, and the dashboard
refreshes every 30 seconds.

The `repeat` option also supports custom intervals such as `2h`, `4d`, `2w`,
`2week`, and `every 4d`. Custom recurrence is calculated from the scheduled
occurrence, so snoozing or restarting the bot does not gradually shift its
original cycle.

## Server Tag Notifications

Only server administrators can configure profile server-tag notifications:

```text
/subtag adopt
/subtag remove
```

Each command opens an ephemeral embed preview. Admins can edit the title,
embed message, normal message content, color, footer, thumbnail, large image,
notification channel, and
enabled state before saving. A shared reward role can also be selected from
either editor. Infinity adds it when a member adopts the server tag and removes
it when the member disables or switches the tag. The selected role must be below
Infinity's highest role and Infinity needs **Manage Roles** permission.
Supported placeholders are `{user}`,
`{displayname}`, `{username}`, `{userid}`, `{tag}`, `{server}`,
`{membercount}`, and `{avatar}`. Settings persist in
`data/subtag-settings.json`.

The optional normal message is sent above the embed. Mentions placed there—or
generated with `{user}`—can send actual notifications. Mentions are suppressed
inside the editor preview to prevent accidental pings while configuring it.

Infinity compares Discord's old and new `primaryGuild` user data. It sends the
configured adopt notification when the member starts displaying this server's
tag and the remove notification when they disable it or switch to another
server tag. **Server Members Intent** must remain enabled.

## Bot Status

Deploy the command once. Server admins can configure or update monitored bots at runtime:

```text
/statuslog add user_id:FROGGY_BOT_USER_ID api_url:http://FROGGY_SERVER_IP:3210/api/status api_key:FROGGY_STATUS_API_KEY channel:#bot-status pinguser:@Status Alerts
/statuslog remove user_id:FROGGY_BOT_USER_ID
/statuspanel channel:#bot-status
```

Infinity resolves the monitored bot's server display name and logo from its Discord user ID. Animated Discord avatars remain GIFs; static avatars use lossless PNG. It checks each configured API every second with a 900ms request timeout. Five consecutive non-online checks are required before an Offline alert. The online duration stops at the first failed check, and the offline duration starts from that same first-failure timestamp. A successful check before failure five cancels the pending outage; the first successful check after a confirmed outage sends the Online recovery alert. The optional `pinguser` value is shown below the alert and may contain normal text, user mentions, role mentions, `@everyone`, `@here`, or a mixture. Registry changes are saved in `data/status-bots.json` and take effect immediately without editing `.env` or restarting Infinity. Reusing the same user ID updates its endpoint, key, channel, notification text, display identity, and current baseline.

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
