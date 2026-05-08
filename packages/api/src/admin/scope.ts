import mongoose from 'mongoose';
import { createModels } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import type { Request } from 'express';
import { createStatusError, parseObjectId } from './utils';

const { User } = createModels(mongoose);

type RequestUser = {
  _id?: mongoose.Types.ObjectId | string;
  id?: string;
  role?: string | null;
};

type ScopedUserRecord = {
  _id: mongoose.Types.ObjectId;
};

type ManagerUserRecord = {
  _id: mongoose.Types.ObjectId;
  departmentId?: mongoose.Types.ObjectId | string | null;
};

export type AdminDataScope =
  | {
      type: 'all';
    }
  | {
      type: 'department';
      departmentId: mongoose.Types.ObjectId;
    };

export function hasAdminDataAccessRole(role: string | null | undefined): boolean {
  return role === SystemRoles.ADMIN || role === SystemRoles.AUDITOR || role === SystemRoles.MANAGER;
}

export function hasFullAdminDataAccess(role: string | null | undefined): boolean {
  return role === SystemRoles.ADMIN || role === SystemRoles.AUDITOR;
}

function getRequestUser(req: Request): RequestUser | undefined {
  return (req as Request & { user?: RequestUser }).user;
}

function getRequestUserId(req: Request): string {
  const user = getRequestUser(req);

  if (typeof user?.id === 'string' && user.id.length > 0) {
    return user.id;
  }

  return user?._id?.toString() ?? '';
}

export async function resolveAdminDataScope(req: Request): Promise<AdminDataScope> {
  const role = getRequestUser(req)?.role;

  if (hasFullAdminDataAccess(role)) {
    return { type: 'all' };
  }

  if (role !== SystemRoles.MANAGER) {
    throw createStatusError(403, 'Admin data access role required');
  }

  const userId = getRequestUserId(req);
  if (!userId) {
    throw createStatusError(403, 'Manager department scope is unavailable');
  }

  const manager = await User.findById(parseObjectId(userId, 'userId'))
    .select('_id departmentId')
    .lean<ManagerUserRecord | null>();

  if (manager?.departmentId == null) {
    throw createStatusError(403, 'Manager department scope is unavailable');
  }

  return {
    type: 'department',
    departmentId: parseObjectId(manager.departmentId.toString(), 'departmentId'),
  };
}

export async function resolveScopedUserIds(
  scope: AdminDataScope,
): Promise<mongoose.Types.ObjectId[] | null> {
  if (scope.type === 'all') {
    return null;
  }

  const users = await User.find({ departmentId: scope.departmentId })
    .select('_id')
    .lean<ScopedUserRecord[]>();

  return users.map((user) => user._id);
}

export async function canAccessUserId(
  scope: AdminDataScope,
  userId: mongoose.Types.ObjectId | string | null | undefined,
): Promise<boolean> {
  if (scope.type === 'all') {
    return true;
  }

  if (userId == null) {
    return false;
  }

  const user = await User.findOne({
    _id: parseObjectId(userId.toString(), 'userId'),
    departmentId: scope.departmentId,
  })
    .select('_id')
    .lean<ScopedUserRecord | null>();

  return user != null;
}
