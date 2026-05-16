#!/usr/bin/env node

const commands = {
  'clear-quotas': () => require('./commands/clear-quotas'),
  'ensure-ollama-gemma-channel': () => require('./commands/ensure-ollama-gemma-channel'),
  'enable-gemma-memory-setting': () => require('./commands/enable-gemma-memory-setting'),
  'inspect-org-users': () => require('./commands/inspect-org-users'),
  'inspect-admin-channels': () => require('./commands/inspect-admin-channels'),
  'inspect-quota-periods': () => require('./commands/inspect-quota-periods'),
  'inspect-user-quota': () => require('./commands/inspect-user-quota'),
  'inspect-recent-files': () => require('./commands/inspect-recent-files'),
  'inspect-user-memories': () => require('./commands/inspect-user-memories'),
};

async function main() {
  const commandName = process.argv[2];
  const command = commands[commandName];

  if (!command) {
    const availableCommands = Object.keys(commands).sort().join(', ');
    throw new Error(`Unknown command "${commandName || ''}". Available commands: ${availableCommands}`);
  }

  await command().run();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
