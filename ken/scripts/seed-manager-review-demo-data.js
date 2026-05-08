const crypto = require('crypto');
const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', 'api') });
const connect = require('../../config/connect');

const DEMO_PREFIX = 'demo-manager-review-status';
const DEMO_DEPARTMENT_CODE = 'DEMO_REVIEW';
const MANAGER_EMAIL = 'demo.manager@example.test';
const MEMBER_EMAIL = 'demo.member@example.test';

const {
  Department,
  ManagerReviewBatch,
  ManagerReviewItem,
  User,
} = createModels(mongoose);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function utcDate(dayOffset, hour = 0) {
  const date = new Date();
  date.setUTCHours(hour, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date;
}

function utcEndOfDay(dayOffset) {
  const date = new Date();
  date.setUTCHours(23, 59, 59, 999);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date;
}

async function upsertUser({ email, name, role }) {
  return User.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        email,
        name,
        username: email.split('@')[0],
        provider: 'local',
        emailVerified: true,
        role,
      },
    },
    { new: true, upsert: true },
  );
}

async function upsertDepartment(managerUserId) {
  const department = await Department.findOneAndUpdate(
    { code: DEMO_DEPARTMENT_CODE },
    {
      $set: {
        name: 'Demo Manager Review Department',
        description: 'Demo data for manager review status display.',
        managerUserId,
        enabled: true,
        sortOrder: 9000,
      },
      $setOnInsert: {
        code: DEMO_DEPARTMENT_CODE,
      },
    },
    { new: true, upsert: true },
  );

  await User.updateOne(
    { email: MEMBER_EMAIL },
    {
      $set: {
        departmentId: department._id,
        departmentAssignedAt: new Date(),
      },
    },
  );

  return department;
}

async function clearPreviousDemoBatches() {
  const previousBatches = await ManagerReviewBatch.find({
    batchKey: { $regex: `^${DEMO_PREFIX}:` },
  }).select('_id');
  const batchIds = previousBatches.map((batch) => batch._id);

  if (batchIds.length > 0) {
    await ManagerReviewItem.deleteMany({ batchId: { $in: batchIds } });
    await ManagerReviewBatch.deleteMany({ _id: { $in: batchIds } });
  }

  return batchIds.length;
}

function createBatchInput({ status, variant, manager, department, index }) {
  const periodStart = utcDate(-(index + 7), 0);
  const periodEnd = utcEndOfDay(-(index + 6));
  const now = new Date();
  const responseStatus =
    variant === 'reviewed-ok' ? 'ok' : variant === 'reviewed-not-ok' ? 'not_ok' : null;
  const responseText =
    variant === 'reviewed-ok'
      ? 'Demo note: 主管確認此期間用量合理。'
      : variant === 'reviewed-not-ok'
        ? 'Demo note: 主管標記不 OK，需後續查看異常用量。'
        : variant === 'cancelled'
          ? 'Demo note: 此批次為取消狀態示範。'
          : '';
  const reviewedAt = responseStatus ? now : null;
  const sentAt = status === 'sent' || status === 'overdue' || status === 'reviewed' ? now : null;
  const dueAt = status === 'overdue' ? utcDate(-1, 18) : utcDate(3, 18);
  const transactionCount = 8 + index * 3;
  const totalInputTokens = 1200 + index * 120;
  const totalWriteTokens = 700 + index * 90;
  const totalReadTokens = 500 + index * 70;
  const totalTokenValue = totalInputTokens + totalWriteTokens + totalReadTokens;

  return {
    batchKey: `${DEMO_PREFIX}:${variant}`,
    managerUserId: manager._id,
    departmentId: department._id,
    cadence: 'daily',
    periodStart,
    periodEnd,
    status,
    replyTokenHash: sha256(`${DEMO_PREFIX}:batch:${variant}`),
    itemCount: 1,
    transactionCount,
    totalTokenValue,
    totalRawAmount: Number((transactionCount * 0.35).toFixed(2)),
    totalInputTokens,
    totalWriteTokens,
    totalReadTokens,
    emailTo: manager.email,
    sentAt,
    dueAt,
    reviewedAt,
    responseStatus,
    responseText,
    createdAt: utcDate(-index, 10),
    updatedAt: now,
  };
}

function createItemInput({ batch, member, variant, index }) {
  const responseStatus = batch.responseStatus || 'pending';

  return {
    batchId: batch._id,
    managerUserId: batch.managerUserId,
    departmentId: batch.departmentId,
    userId: member._id,
    conversationId: `${DEMO_PREFIX}-conversation-${index + 1}`,
    status: responseStatus,
    riskLevel: variant === 'reviewed-not-ok' || variant === 'overdue' ? 'attention' : 'normal',
    replyTokenHash: sha256(`${DEMO_PREFIX}:item:${variant}`),
    transactionCount: batch.transactionCount,
    totalTokenValue: batch.totalTokenValue,
    totalRawAmount: batch.totalRawAmount,
    totalInputTokens: batch.totalInputTokens,
    totalWriteTokens: batch.totalWriteTokens,
    totalReadTokens: batch.totalReadTokens,
    newestTransactionAt: batch.periodEnd,
    reviewedAt: batch.reviewedAt,
    responseText: batch.responseText,
  };
}

async function seedManagerReviewDemoData() {
  await connect();

  const manager = await upsertUser({
    email: MANAGER_EMAIL,
    name: 'Demo Manager',
    role: 'MANAGER',
  });
  const member = await upsertUser({
    email: MEMBER_EMAIL,
    name: 'Demo Member',
    role: 'USER',
  });
  const department = await upsertDepartment(manager._id);
  const deletedCount = await clearPreviousDemoBatches();

  const scenarios = [
    { status: 'generated', variant: 'generated' },
    { status: 'sent', variant: 'sent' },
    { status: 'reviewed', variant: 'reviewed-ok' },
    { status: 'reviewed', variant: 'reviewed-not-ok' },
    { status: 'overdue', variant: 'overdue' },
    { status: 'cancelled', variant: 'cancelled' },
  ];

  const batches = [];
  for (const [index, scenario] of scenarios.entries()) {
    const batch = await ManagerReviewBatch.create(
      createBatchInput({
        ...scenario,
        manager,
        department,
        index,
      }),
    );
    await ManagerReviewItem.create(
      createItemInput({
        batch,
        member,
        variant: scenario.variant,
        index,
      }),
    );
    batches.push(batch);
  }

  console.log(`Deleted previous demo batches: ${deletedCount}`);
  console.log(`Created demo department: ${department.name} (${department._id})`);
  console.log(`Created demo manager: ${manager.email} (${manager._id})`);
  console.log(`Created demo member: ${member.email} (${member._id})`);
  console.log('Created manager review demo batches:');
  batches.forEach((batch) => {
    const response = batch.responseStatus ? ` / response=${batch.responseStatus}` : '';
    console.log(`- ${batch.status}${response}: ${batch.emailTo} / ${batch.batchKey}`);
  });
}

seedManagerReviewDemoData()
  .then(() => {
    mongoose.disconnect().finally(() => process.exit(0));
  })
  .catch((error) => {
    console.error(`Failed to seed manager review demo data: ${error.message}`);
    mongoose.disconnect().finally(() => process.exit(1));
  });
