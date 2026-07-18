import 'dotenv/config';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { closeDatabase, connectDatabase } from '../src/database/mongo.js';
import { importStoreDocument, listStoreDocuments } from '../src/database/storeRepository.js';

const execFileAsync = promisify(execFile);
const mappings = [
  ['auto-replies.json', 'auto-replies'],
  ['subtag-settings.json', 'subtag-settings'],
  ['giveaways.json', 'giveaways'],
  ['invite-dashboard.json', 'invite-dashboard'],
  ['ticket-settings.json', 'ticket-settings'],
  ['status-bots.json', 'status-bots'],
  ['reminders.json', 'reminders'],
  ['auto-reactions.json', 'auto-reactions'],
  ['auto-ping.json', 'auto-ping']
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const archive = option('--archive');
const directory = option('--directory');
const overwrite = process.argv.includes('--force');

if (Boolean(archive) === Boolean(directory)) {
  throw new Error('Provide exactly one source: --archive <file.tar.gz> or --directory <data-folder>.');
}

async function readJson(filename) {
  if (archive) {
    const { stdout } = await execFileAsync('tar', [
      '-xOzf',
      path.resolve(archive),
      `data/${filename}`
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(stdout);
  }
  return JSON.parse(await readFile(path.join(path.resolve(directory), filename), 'utf8'));
}

await connectDatabase();
try {
  for (const [filename, key] of mappings) {
    const data = await readJson(filename);
    const result = await importStoreDocument(key, data, { overwrite });
    console.log(`${key}: ${result}`);
  }

  const documents = await listStoreDocuments();
  console.log(`Migration complete. MongoDB contains ${documents.length} Infinity stores.`);
} finally {
  await closeDatabase();
}

