const path = require('path');
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', '..', '..', '..', 'api') });
const connect = require('../../../../config/connect');

function stringifyId(value) {
  if (value == null) {
    return null;
  }

  return value.toString();
}

function formatUser(user) {
  return {
    id: stringifyId(user._id),
    email: user.email ?? null,
    username: user.username ?? null,
    name: user.name ?? null,
    role: user.role ?? null,
    departmentId: stringifyId(user.departmentId),
  };
}

async function run() {
  await connect();

  try {
    const models = createModels(mongoose);
    const [departments, users, userCount, assignedUserCount] = await Promise.all([
      models.Department.find({})
        .select('_id code name parentDepartmentId enabled')
        .sort({ code: 1, name: 1 })
        .lean(),
      models.User.find({})
        .select('_id email username name role departmentId createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(500)
        .lean(),
      models.User.countDocuments({}),
      models.User.countDocuments({ departmentId: { $ne: null } }),
    ]);

    const departmentIds = new Set(departments.map((department) => stringifyId(department._id)));
    const usersByDepartment = new Map();
    const unassignedUsers = [];
    const usersWithMissingDepartment = [];

    for (const user of users) {
      const departmentId = stringifyId(user.departmentId);
      if (departmentId == null) {
        unassignedUsers.push(user);
        continue;
      }

      if (!departmentIds.has(departmentId)) {
        usersWithMissingDepartment.push(user);
        continue;
      }

      const departmentUsers = usersByDepartment.get(departmentId) ?? [];
      departmentUsers.push(user);
      usersByDepartment.set(departmentId, departmentUsers);
    }

    const departmentSummaries = departments.map((department) => {
      const departmentId = stringifyId(department._id);
      const departmentUsers = usersByDepartment.get(departmentId) ?? [];
      return {
        id: departmentId,
        code: department.code,
        name: department.name,
        parentDepartmentId: stringifyId(department.parentDepartmentId),
        enabled: department.enabled,
        sampledUserCount: departmentUsers.length,
        sampledUsers: departmentUsers.slice(0, 8).map(formatUser),
      };
    });

    console.log(
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          departments: {
            count: departments.length,
            items: departmentSummaries,
          },
          users: {
            totalCount: userCount,
            sampledCount: users.length,
            assignedTotalCount: assignedUserCount,
            sampledUnassignedCount: unassignedUsers.length,
            sampledMissingDepartmentCount: usersWithMissingDepartment.length,
            sampledUnassignedUsers: unassignedUsers.slice(0, 8).map(formatUser),
            sampledUsersWithMissingDepartment: usersWithMissingDepartment.slice(0, 8).map(formatUser),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { run };
