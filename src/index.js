import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config.js';
import { ticketCommand } from './commands/ticket.js';
import { statusLogCommand } from './commands/statusLog.js';
import { statusPanelCommand } from './commands/statusPanel.js';
import { giveawayCommand } from './commands/giveaway.js';
import { pingCommand } from './commands/ping.js';
import { autoReactCommand } from './commands/autoreact.js';
import { autoReplyCommand } from './commands/autoreply.js';
import { reactCommand } from './commands/react.js';
import { autoPingCommand } from './commands/autoping.js';
import { handleAutoPingMemberJoin } from './autoping/autoPingService.js';
import { handleAutoReactMessage, isBotOwner } from './autoreact/autoReactService.js';
import { handleAutoReplyMessage } from './autoreply/autoReplyService.js';
import {
  handleStealInteraction,
  handleStealModal,
  handleStealPrefix
} from './steal/stealService.js';
import {
  scheduleActiveGiveaways
} from './giveaways/giveawayService.js';
import { handleStatusInteraction, startStatusMonitor } from './status/statusMonitor.js';
import {
  cancelEditor,
  handleEditorAction,
  handleEditorChannelSelect,
  handleEditorModal,
  handleEditorStringSelect,
  ignoreTypePreview,
  sendFinalPanel
} from './tickets/panelEditor.js';
import {
  cancelCloseTicket,
  claimTicket,
  closeTicket,
  createTicket,
  requestCloseTicket
} from './tickets/ticketService.js';
import { privateCv2Flags, simpleContainer } from './ui/cv2.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ]
});

const commands = new Map([
  [ticketCommand.data.name, ticketCommand],
  [statusLogCommand.data.name, statusLogCommand],
  [statusPanelCommand.data.name, statusPanelCommand],
  [giveawayCommand.data.name, giveawayCommand],
  [pingCommand.data.name, pingCommand],
  [autoReactCommand.data.name, autoReactCommand],
  [autoReplyCommand.data.name, autoReplyCommand],
  [reactCommand.data.name, reactCommand],
  [autoPingCommand.data.name, autoPingCommand]
]);

const publicCommands = new Set(['giveaway', 'ping', 'statuslog', 'statuspanel', 'autoping']);

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  startStatusMonitor(readyClient);
  scheduleActiveGiveaways(readyClient).catch((error) => {
    console.error('Giveaway scheduler startup error:', error);
  });
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleAutoReplyMessage(message);
    await handleAutoReactMessage(message);

    await handleStealPrefix(message);
  } catch (error) {
    console.error('Message handler error:', error);
    if (message.content?.startsWith('>>steal')) {
      await message.reply('Something went wrong while stealing that expression.').catch(() => {});
    }
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    await handleAutoPingMemberJoin(member);
  } catch (error) {
    console.error('Auto-ping member join error:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;

      if (!publicCommands.has(interaction.commandName) && !isBotOwner(interaction.user.id)) {
        await interaction.reply({
          flags: privateCv2Flags,
          components: [simpleContainer('Owner Only', 'Only the bot owner can use this command.')]
        });
        return;
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket_editor_modal:')) {
      await handleEditorModal(interaction);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('steal_modal:')) {
      const handled = await handleStealModal(interaction);
      if (handled) return;
    }

    if (
      (interaction.isChannelSelectMenu() || interaction.isRoleSelectMenu()) &&
      interaction.customId.startsWith('ticket_editor_select:')
    ) {
      await handleEditorChannelSelect(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:create') {
      await createTicket(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('steal:')) {
      const handled = await handleStealInteraction(interaction);
      if (handled) return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('status_panel:')) {
      const handled = await handleStatusInteraction(interaction);
      if (handled) return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_editor:action') {
      await handleEditorAction(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('ticket_editor_select:')) {
      const handled = await handleEditorStringSelect(interaction);
      if (handled) return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_editor:type_preview') {
      await ignoreTypePreview(interaction);
      return;
    }

    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('steal:')) {
      const handled = await handleStealInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId.startsWith('status_alert_delete:')) {
      const handled = await handleStatusInteraction(interaction);
      if (handled) return;
    }

    if (interaction.customId === 'ticket_editor:send') {
      await sendFinalPanel(interaction);
      return;
    }

    if (interaction.customId === 'ticket_editor:cancel') {
      await cancelEditor(interaction);
      return;
    }

    if (interaction.customId === 'ticket:claim') {
      await claimTicket(interaction);
      return;
    }

    if (interaction.customId === 'ticket:close') {
      await requestCloseTicket(interaction);
      return;
    }

    if (interaction.customId === 'ticket:close_cancel') {
      await cancelCloseTicket(interaction);
      return;
    }

    if (interaction.customId === 'ticket:close_confirm') {
      await closeTicket(interaction);
    }
  } catch (error) {
    logInteractionError(error, interaction);

    const response = {
      flags: privateCv2Flags,
      components: [simpleContainer('Something Went Wrong', userErrorMessage(error))]
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

await client.login(config.token);

function userErrorMessage(error) {
  if (error?.code === 50013) {
    return 'I am missing permission for that action. Please check my channel, role, and category permissions.';
  }

  if (error?.code === 50001) {
    return 'I cannot access that channel or category. Please check permissions or set the correct ID.';
  }

  if (error?.code === 10003) {
    return 'That channel or category no longer exists. Please update the ticket panel settings.';
  }

  if (error?.code === 50035) {
    return 'Discord rejected one of the saved values. Please check image URLs, emoji, channel IDs, and role IDs.';
  }

  return 'Please try again or contact a staff member.';
}

function logInteractionError(error, interaction) {
  const details = {
    name: error?.name,
    code: error?.code,
    message: error?.message,
    interactionType: interaction?.type,
    commandName: interaction?.isChatInputCommand?.() ? interaction.commandName : undefined,
    customId: interaction?.customId,
    userId: interaction?.user?.id,
    guildId: interaction?.guildId,
    channelId: interaction?.channelId
  };

  console.error('Interaction error:', details);
  console.error(error);
}
