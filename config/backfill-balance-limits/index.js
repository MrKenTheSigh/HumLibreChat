const path = require('path');
const mongoose = require('mongoose');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', 'api') });

const { silentExit } = require('../helpers');

let User;
let Balance;
let AdminPlan;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    email: null,
    userId: null,
    limit: null,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg.startsWith('--email=')) {
      options.email = arg.slice('--email='.length).trim().toLowerCase() || null;
      continue;
    }

    if (arg.startsWith('--user-id=')) {
      options.userId = arg.slice('--user-id='.length).trim() || null;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = Number.parseInt(arg.slice('--limit='.length).trim(), 10);
      if (Number.isFinite(value) && value > 0) {
        options.limit = value;
      }
    }
  }

  return options;
}

function printUsage() {
  console.orange(
    'Usage: npm run backfill-balance-limits -- [--dry-run] [--force] [--email=<email>] [--user-id=<id>] [--limit=<n>]',
  );
  console.orange('Examples:');
  console.orange('  npm run backfill-balance-limits -- --dry-run');
  console.orange('  npm run backfill-balance-limits -- --email=user@example.com');
  console.orange('  npm run backfill-balance-limits -- --user-id=66123456789abcdef012345');
  console.orange('  npm run backfill-balance-limits -- --dry-run --limit=20');
}

function getNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasBackfillFields(balance) {
  return (
    typeof balance?.tokenCreditsLimit === 'number' &&
    typeof balance?.planTokenCredits === 'number' &&
    typeof balance?.planTokenCreditsLimit === 'number'
  );
}

function computeBackfill(balance, planStartingCredits) {
  const tokenCredits = Math.max(getNumber(balance?.tokenCredits), 0);
  const safePlanLimit = Math.max(getNumber(planStartingCredits), 0);
  const planTokenCredits = Math.min(tokenCredits, safePlanLimit);
  const tokenCreditsLimit = Math.max(tokenCredits, safePlanLimit);

  return {
    tokenCredits,
    tokenCreditsLimit,
    planTokenCredits,
    planTokenCreditsLimit: safePlanLimit,
  };
}

function isSameBackfill(balance, nextValues) {
  return (
    getNumber(balance?.tokenCredits) === nextValues.tokenCredits &&
    getNumber(balance?.tokenCreditsLimit) === nextValues.tokenCreditsLimit &&
    getNumber(balance?.planTokenCredits) === nextValues.planTokenCredits &&
    getNumber(balance?.planTokenCreditsLimit) === nextValues.planTokenCreditsLimit
  );
}

async function resolveTargetUserIds(options) {
  if (options.userId) {
    if (!mongoose.Types.ObjectId.isValid(options.userId)) {
      throw new Error(`Invalid user id: ${options.userId}`);
    }

    return [new mongoose.Types.ObjectId(options.userId)];
  }

  if (!options.email) {
    return null;
  }

  const user = await User.findOne({ email: options.email }).select('_id email').lean();
  if (!user?._id) {
    throw new Error(`No user found for email: ${options.email}`);
  }

  return [user._id];
}

async function loadContextBalances(targetUserIds, limit) {
  const query = targetUserIds?.length ? { user: { $in: targetUserIds } } : {};
  const cursor = Balance.find(query)
    .select('user tokenCredits tokenCreditsLimit planTokenCredits planTokenCreditsLimit')
    .sort({ _id: 1 });

  if (limit != null) {
    cursor.limit(limit);
  }

  return cursor.lean();
}

(async () => {
  const options = parseArgs(process.argv.slice(2));
  if (process.argv.includes('--help')) {
    printUsage();
    silentExit(0);
  }

  const connect = require('../connect');
  const { createModels } = require('@librechat/data-schemas');
  ({ User, Balance, AdminPlan } = createModels(mongoose));

  await connect();

  console.purple('--------------------------------');
  console.purple('Backfill balance limit fields');
  console.purple('--------------------------------');

  const targetUserIds = await resolveTargetUserIds(options);
  const balances = await loadContextBalances(targetUserIds, options.limit);

  if (balances.length === 0) {
    console.yellow('No balance records matched the requested filter.');
    silentExit(0);
  }

  const userIds = balances.map((balance) => balance.user).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } })
    .select('_id email adminPlanId')
    .lean();

  const userMap = new Map(users.map((user) => [user._id.toString(), user]));
  const planIds = Array.from(
    new Set(
      users
        .map((user) => user.adminPlanId?.toString())
        .filter((planId) => typeof planId === 'string' && planId.length > 0),
    ),
  ).map((planId) => new mongoose.Types.ObjectId(planId));

  const plans =
    planIds.length > 0
      ? await AdminPlan.find({ _id: { $in: planIds } })
          .select('_id name slug enabled startingCredits')
          .lean()
      : [];

  const planMap = new Map(plans.map((plan) => [plan._id.toString(), plan]));

  const summary = {
    scanned: balances.length,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    errors: 0,
  };

  for (const balance of balances) {
    const user = userMap.get(balance.user.toString());
    if (!user) {
      summary.skipped += 1;
      console.yellow(`Skipping balance ${balance._id}: user ${balance.user} not found`);
      continue;
    }

    const alreadyBackfilled = hasBackfillFields(balance);
    if (alreadyBackfilled && options.force !== true) {
      summary.skipped += 1;
      continue;
    }

    const plan = user.adminPlanId ? planMap.get(user.adminPlanId.toString()) : null;
    const planStartingCredits = plan?.enabled !== false ? getNumber(plan?.startingCredits) : 0;

    const nextValues = computeBackfill(balance, planStartingCredits);
    if (isSameBackfill(balance, nextValues)) {
      summary.unchanged += 1;
      continue;
    }

    const descriptor = `${user.email ?? user._id.toString()} | credits=${nextValues.tokenCredits} | limit=${nextValues.tokenCreditsLimit} | planCredits=${nextValues.planTokenCredits} | planLimit=${nextValues.planTokenCreditsLimit}`;

    if (options.dryRun) {
      console.cyan(`[dry-run] ${descriptor}`);
      summary.updated += 1;
      continue;
    }

    try {
      await Balance.updateOne(
        { _id: balance._id },
        {
          $set: {
            tokenCredits: nextValues.tokenCredits,
            tokenCreditsLimit: nextValues.tokenCreditsLimit,
            planTokenCredits: nextValues.planTokenCredits,
            planTokenCreditsLimit: nextValues.planTokenCreditsLimit,
          },
        },
      );
      console.green(`[updated] ${descriptor}`);
      summary.updated += 1;
    } catch (error) {
      summary.errors += 1;
      console.red(
        `[error] Failed to update ${user.email ?? user._id.toString()}: ${error.message}`,
      );
    }
  }

  console.purple('--------------------------------');
  console.purple(`Scanned: ${summary.scanned}`);
  console.purple(`Updated: ${summary.updated}`);
  console.purple(`Skipped: ${summary.skipped}`);
  console.purple(`Unchanged: ${summary.unchanged}`);
  console.purple(`Errors: ${summary.errors}`);
  console.purple('--------------------------------');

  silentExit(summary.errors > 0 ? 1 : 0);
})().catch((error) => {
  console.red(`Backfill failed: ${error.message}`);
  console.error(error);
  silentExit(1);
});

process.on('uncaughtException', (err) => {
  if (!err.message.includes('fetch failed')) {
    console.error('There was an uncaught error:');
    console.error(err);
  }

  if (!err.message.includes('fetch failed')) {
    process.exit(1);
  }
});
