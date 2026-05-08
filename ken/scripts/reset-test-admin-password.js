const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const readline = require('readline');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', 'api') });
const connect = require('../../config/connect');

const ADMIN_EMAIL = 'test@test.test';
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

const { User, Session } = createModels(mongoose);

function getPasswordFromArgs() {
  const passwordArg = process.argv.find((arg) => arg.startsWith('--password='));
  if (passwordArg) {
    return passwordArg.slice('--password='.length);
  }

  if (process.argv[2] && !process.argv[2].startsWith('--')) {
    return process.argv[2];
  }

  return process.env.TEST_ADMIN_PASSWORD;
}

function validatePassword(password) {
  if (!password) {
    return 'Password is required.';
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }

  if (!password.trim()) {
    return 'Password cannot be only whitespace.';
  }

  return null;
}

function askHidden(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  rl._writeToOutput = function writeToOutput() {
    rl.output.write('*');
  };

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function promptForPassword() {
  while (true) {
    const password = await askHidden(`New password for ${ADMIN_EMAIL}: `);
    const validationError = validatePassword(password);
    if (validationError) {
      console.error(validationError);
      continue;
    }

    const confirmation = await askHidden('Confirm new password: ');
    if (password !== confirmation) {
      console.error('Passwords do not match.');
      continue;
    }

    return password;
  }
}

async function resetPassword() {
  const providedPassword = getPasswordFromArgs();
  const password = providedPassword || (await promptForPassword());
  const validationError = validatePassword(password);

  if (validationError) {
    throw new Error(validationError);
  }

  await connect();

  const user = await User.findOne({ email: ADMIN_EMAIL }).select('_id email');
  if (!user) {
    throw new Error(`User ${ADMIN_EMAIL} was not found.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        password: passwordHash,
      },
      $unset: {
        refreshToken: '',
      },
    },
  );

  const { deletedCount } = await Session.deleteMany({ user: user._id });
  console.log(`Password reset for ${ADMIN_EMAIL}. Deleted ${deletedCount || 0} active sessions.`);
}

resetPassword()
  .then(() => {
    mongoose.disconnect().finally(() => process.exit(0));
  })
  .catch((error) => {
    console.error(`Failed to reset password: ${error.message}`);
    mongoose.disconnect().finally(() => process.exit(1));
  });
