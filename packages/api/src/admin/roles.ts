import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import { permissionsSchema, roleDefaults, SystemRoles } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import type { IRole } from '@librechat/data-schemas';
import { writeRequestActivityLog } from './activityLogs';
import { createStatusError } from './utils';

const { Role, User } = createModels(mongoose);

const systemRoleNames = new Set<string>(Object.values(SystemRoles));

const roleNameRegex = /^[A-Z][A-Z0-9_]{1,39}$/;

const adminRoleCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => roleNameRegex.test(value), {
      message: 'Role name must be 2-40 chars using A-Z, 0-9, or _ and start with a letter',
    }),
  description: z
    .union([z.string().trim().max(240), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .optional()
    .nullable(),
  permissions: permissionsSchema,
});

const adminRoleUpdateSchema = z
  .object({
    description: z
      .union([z.string().trim().max(240), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .optional()
      .nullable(),
    permissions: permissionsSchema.optional(),
  })
  .refine((value) => value.description !== undefined || value.permissions !== undefined, {
    message: 'At least one field must be provided',
  });

type RoleRecord = Pick<
  IRole,
  'name' | 'description' | 'isSystem' | 'isEditable' | 'isDeletable' | 'permissions'
> & {
  createdAt?: Date;
  updatedAt?: Date;
};

function createDefaultRoleRecord(roleName: SystemRoles): RoleRecord {
  const defaultRole = roleDefaults[roleName];
  return {
    name: defaultRole.name,
    description: defaultRole.description,
    isSystem: defaultRole.isSystem,
    isEditable: defaultRole.isEditable,
    isDeletable: defaultRole.isDeletable,
    permissions: defaultRole.permissions,
  } as RoleRecord;
}

function sanitizeRole(role: RoleRecord | null) {
  if (!role) {
    return null;
  }

  const defaultRole = roleDefaults[role.name as keyof typeof roleDefaults];
  const fallbackPermissions = defaultRole?.permissions ?? roleDefaults[SystemRoles.USER].permissions;
  const mergedPermissions = Object.fromEntries(
    Object.keys(permissionsSchema.shape).map((permissionType) => {
      const permissionKey = permissionType as keyof typeof fallbackPermissions;
      return [
        permissionType,
        Object.assign(
          {},
          fallbackPermissions[permissionKey] ?? {},
          role.permissions?.[permissionKey as keyof typeof role.permissions] ?? {},
        ),
      ];
    }),
  ) as IRole['permissions'];

  return {
    name: role.name,
    description: role.description ?? null,
    isSystem: defaultRole?.isSystem ?? role.isSystem ?? false,
    isEditable: defaultRole?.isEditable ?? role.isEditable ?? true,
    isDeletable: defaultRole?.isDeletable ?? role.isDeletable ?? true,
    permissions: mergedPermissions,
  };
}

function handleAdminRoleError(error: unknown, res: Response, context: string) {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request';
    return res.status(400).json({ message });
  }

  const statusCode =
    error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : 500;

  if (statusCode >= 500) {
    logger.error(context, error);
  }

  const message =
    error instanceof Error ? error.message : 'An unexpected admin roles request error occurred';
  return res.status(statusCode).json({ message });
}

async function writeRoleActivityLog(
  req: Request,
  action: string,
  result: 'success' | 'failure',
  roleName: string | null,
  message = '',
) {
  await writeRequestActivityLog(req, {
    resourceType: 'role',
    resourceId: roleName,
    action,
    result,
    message,
    metadata: roleName ? { roleName } : {},
  });
}

export async function getAdminRoles(_req: Request, res: Response) {
  try {
    const roles = await Role.find({})
      .select('name description isSystem isEditable isDeletable permissions')
      .sort({ isSystem: -1, name: 1 })
      .lean<RoleRecord[]>();
    const roleMap = new Map<string, RoleRecord>(
      roles.map((role): [string, RoleRecord] => [role.name, role]),
    );

    for (const roleName of Object.values(SystemRoles)) {
      if (!roleMap.has(roleName)) {
        roleMap.set(roleName, createDefaultRoleRecord(roleName));
      }
    }

    const mergedRoles = Array.from(roleMap.values()).sort((left, right) => {
      const leftSystem = systemRoleNames.has(left.name) ? 0 : 1;
      const rightSystem = systemRoleNames.has(right.name) ? 0 : 1;

      if (leftSystem !== rightSystem) {
        return leftSystem - rightSystem;
      }

      return left.name.localeCompare(right.name);
    });

    return res.status(200).json({
      roles: mergedRoles.map(sanitizeRole),
    });
  } catch (error) {
    return handleAdminRoleError(error, res, '[getAdminRoles]');
  }
}

export async function getAdminRole(req: Request, res: Response) {
  try {
    const roleName = req.params.roleName.trim().toUpperCase();
    const role = await Role.findOne({ name: roleName })
      .select('name description isSystem isEditable isDeletable permissions')
      .lean<RoleRecord | null>();

    if (!role && systemRoleNames.has(roleName)) {
      return res.status(200).json(sanitizeRole(createDefaultRoleRecord(roleName as SystemRoles)));
    }

    if (!role) {
      throw createStatusError(404, 'Role not found');
    }

    return res.status(200).json(sanitizeRole(role));
  } catch (error) {
    return handleAdminRoleError(error, res, '[getAdminRole]');
  }
}

export async function createAdminRole(req: Request, res: Response) {
  try {
    const body = adminRoleCreateSchema.parse(req.body);

    if (systemRoleNames.has(body.name)) {
      throw createStatusError(409, 'System role already exists');
    }

    const existingRole = await Role.findOne({ name: body.name }).select('_id').lean();
    if (existingRole) {
      throw createStatusError(409, 'A role with that name already exists');
    }

    const createdRole = await Role.create({
      name: body.name,
      description: body.description ?? null,
      isSystem: false,
      isEditable: true,
      isDeletable: true,
      permissions: body.permissions,
    });

    const role = await Role.findById(createdRole._id)
      .select('name description isSystem isEditable isDeletable permissions')
      .lean<RoleRecord | null>();

    await writeRoleActivityLog(req, 'role.create', 'success', body.name);

    return res.status(201).json(sanitizeRole(role));
  } catch (error) {
    await writeRoleActivityLog(
      req,
      'role.create',
      'failure',
      typeof req.body?.name === 'string' ? req.body.name.toUpperCase() : null,
      error instanceof Error ? error.message : 'Failed to create role',
    );
    return handleAdminRoleError(error, res, '[createAdminRole]');
  }
}

export async function updateAdminRole(req: Request, res: Response) {
  try {
    const roleName = req.params.roleName.trim().toUpperCase();
    const body = adminRoleUpdateSchema.parse(req.body);

    const existingRole = await Role.findOne({ name: roleName })
      .select('name isEditable')
      .lean<Pick<RoleRecord, 'name' | 'isEditable'> | null>();

    if (!existingRole) {
      throw createStatusError(404, 'Role not found');
    }

    if (existingRole.isEditable === false) {
      throw createStatusError(403, 'This role cannot be edited');
    }

    const updates = {
      ...(body.description !== undefined ? { description: body.description ?? null } : {}),
      ...(body.permissions ? { permissions: body.permissions } : {}),
    };

    const updatedRole = await Role.findOneAndUpdate({ name: roleName }, { $set: updates }, { new: true })
      .select('name description isSystem isEditable isDeletable permissions')
      .lean<RoleRecord | null>();

    await writeRoleActivityLog(req, 'role.update', 'success', roleName);

    return res.status(200).json(sanitizeRole(updatedRole));
  } catch (error) {
    await writeRoleActivityLog(
      req,
      'role.update',
      'failure',
      typeof req.params.roleName === 'string' ? req.params.roleName.toUpperCase() : null,
      error instanceof Error ? error.message : 'Failed to update role',
    );
    return handleAdminRoleError(error, res, '[updateAdminRole]');
  }
}

export async function deleteAdminRole(req: Request, res: Response) {
  try {
    const roleName = req.params.roleName.trim().toUpperCase();
    const role = await Role.findOne({ name: roleName })
      .select('name isDeletable')
      .lean<Pick<RoleRecord, 'name' | 'isDeletable'> | null>();

    if (!role) {
      throw createStatusError(404, 'Role not found');
    }

    if (role.isDeletable === false || role.name === SystemRoles.ADMIN) {
      throw createStatusError(403, 'This role cannot be deleted');
    }

    const assignedUser = await User.findOne({ role: roleName }).select('_id').lean();
    if (assignedUser) {
      throw createStatusError(409, 'Cannot delete a role that is assigned to users');
    }

    await Role.deleteOne({ name: roleName });

    await writeRoleActivityLog(req, 'role.delete', 'success', roleName);

    return res.status(200).json({
      deleted: true,
      roleName,
    });
  } catch (error) {
    await writeRoleActivityLog(
      req,
      'role.delete',
      'failure',
      typeof req.params.roleName === 'string' ? req.params.roleName.toUpperCase() : null,
      error instanceof Error ? error.message : 'Failed to delete role',
    );
    return handleAdminRoleError(error, res, '[deleteAdminRole]');
  }
}
