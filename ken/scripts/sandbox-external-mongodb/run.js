#!/usr/bin/env node

const commands = {
  'clear-quotas': () => require('./commands/clear-quotas'),
  'inspect-org-users': () => require('./commands/inspect-org-users'),
  'inspect-quota-periods': () => require('./commands/inspect-quota-periods'),
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
