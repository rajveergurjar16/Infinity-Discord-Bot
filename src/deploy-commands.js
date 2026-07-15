import { REST, Routes } from 'discord.js';
import { config } from './config.js';
import { ticketCommand } from './commands/ticket.js';
import { statusLogCommand } from './commands/statusLog.js';
import { giveawayCommand } from './commands/giveaway.js';
import { pingCommand } from './commands/ping.js';
import { autoReactCommand } from './commands/autoreact.js';
import { autoReplyCommand } from './commands/autoreply.js';
import { reactCommand } from './commands/react.js';

const commands = [
  ticketCommand.data.toJSON(),
  statusLogCommand.data.toJSON(),
  giveawayCommand.data.toJSON(),
  pingCommand.data.toJSON(),
  autoReactCommand.data.toJSON(),
  autoReplyCommand.data.toJSON(),
  reactCommand.data.toJSON()
];
const rest = new REST({ version: '10' }).setToken(config.token);

await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
  body: commands
});

console.log('Guild commands deployed.');
