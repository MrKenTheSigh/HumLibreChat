import mongoose from 'mongoose';
import { z } from 'zod';
import { createModels, logger } from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import {
  createStatusError,
  parseObjectId,
  parseOptionalBoolean,
  trimSearch,
} from './utils';
import { writeRequestActivityLog } from './activityLogs';

const { Department, User } = createModels(mongoose);

const departmentCodePattern = /^[A-Z][A-Z0-9_-]{1,39}$/;

const objectIdOrNullSchema = z
  .union([z.string().trim().min(1), z.literal(''), z.null()])
  .optional()
  .transform((value) => {
    if (value == null || value === '') {
      return null;
    }
    return value;
  });

const adminDepartmentCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => departmentCodePattern.test(value), {
      message: 'Department code must be 2-40 chars using A-Z, 0-9, hyphen, or underscore',
    }),
  name: z.string().trim().min(1, 'name is required').max(120, 'name is too long'),
  description: z.string().trim().max(240, 'description is too long').optional().default(''),
  parentDepartmentId: objectIdOrNullSchema,
  managerUserId: objectIdOrNullSchema,
  enabled: z.boolean().optional().default(true),
  sortOrder: z.number().int('sortOrder must be an integer').optional().default(0),
});

const adminDepartmentUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'name is required').max(120, 'name is too long').optional(),
    description: z.string().trim().max(240, 'description is too long').optional(),
    parentDepartmentId: objectIdOrNullSchema,
    managerUserId: objectIdOrNullSchema,
    enabled: z.boolean().optional(),
    sortOrder: z.number().int('sortOrder must be an integer').optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.description !== undefined ||
      value.parentDepartmentId !== undefined ||
      value.managerUserId !== undefined ||
      value.enabled !== undefined ||
      value.sortOrder !== undefined,
    { message: 'At least one field must be provided' },
  );

type DepartmentRecord = {
  _id: mongoose.Types.ObjectId;
  code: string;
  name: string;
  description?: string;
  parentDepartmentId?: mongoose.Types.ObjectId | string | null;
  managerUserId?: mongoose.Types.ObjectId | string | null;
  enabled?: boolean;
  sortOrder?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type DepartmentInput = z.infer<typeof adminDepartmentCreateSchema>;
type DepartmentUpdateInput = z.infer<typeof adminDepartmentUpdateSchema>;

function handleAdminDepartmentError(error: unknown, res: Response, context: string) {
  if (error instanceof z.ZodError) {
    const message = error.issues[0]?.message ?? 'Invalid request body';
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
    error instanceof Error ? error.message : 'An unexpected admin departments request error occurred';
  return res.status(statusCode).json({ message });
}

function toIdString(value: mongoose.Types.ObjectId | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  return value.toString();
}

async function writeDepartmentActivityLog(
  req: Request,
  action: string,
  result: 'success' | 'failure',
  departmentId: string | null,
  message = '',
) {
  await writeRequestActivityLog(req, {
    resourceType: 'department',
    resourceId: departmentId,
    action,
    result,
    message,
    metadata: departmentId ? { departmentId } : {},
  });
}

function sanitizeDepartment(department: DepartmentRecord) {
  return {
    id: department._id.toString(),
    code: department.code,
    name: department.name,
    description: department.description ?? '',
    parentDepartmentId: toIdString(department.parentDepartmentId),
    managerUserId: toIdString(department.managerUserId),
    enabled: department.enabled ?? true,
    sortOrder: department.sortOrder ?? 0,
    createdAt: department.createdAt?.toISOString() ?? null,
    updatedAt: department.updatedAt?.toISOString() ?? null,
  };
}

async function assertDepartmentExists(
  departmentId: string | null,
  fieldName: string,
): Promise<mongoose.Types.ObjectId | null> {
  if (departmentId == null) {
    return null;
  }

  const objectId = parseObjectId(departmentId, fieldName);
  const department = await Department.findById(objectId).select('_id').lean();
  if (!department) {
    throw createStatusError(404, `${fieldName} not found`);
  }

  return objectId;
}

async function assertUserExists(
  userId: string | null,
  fieldName: string,
): Promise<mongoose.Types.ObjectId | null> {
  if (userId == null) {
    return null;
  }

  const objectId = parseObjectId(userId, fieldName);
  const user = await User.findById(objectId).select('_id').lean();
  if (!user) {
    throw createStatusError(404, `${fieldName} not found`);
  }

  return objectId;
}

async function buildDepartmentWrite(input: DepartmentInput | DepartmentUpdateInput) {
  const [parentDepartmentId, managerUserId] = await Promise.all([
    input.parentDepartmentId !== undefined
      ? assertDepartmentExists(input.parentDepartmentId, 'parentDepartmentId')
      : Promise.resolve(undefined),
    input.managerUserId !== undefined
      ? assertUserExists(input.managerUserId, 'managerUserId')
      : Promise.resolve(undefined),
  ]);

  return {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(parentDepartmentId !== undefined ? { parentDepartmentId } : {}),
    ...(managerUserId !== undefined ? { managerUserId } : {}),
  };
}

export async function getAdminDepartments(req: Request, res: Response) {
  try {
    const search = trimSearch(req.query.search);
    const enabled = parseOptionalBoolean(req.query.enabled);
    const filters: mongoose.FilterQuery<DepartmentRecord>[] = [];

    if (search) {
      const regex = new RegExp(search, 'i');
      filters.push({ $or: [{ code: regex }, { name: regex }] });
    }

    if (typeof enabled === 'boolean') {
      filters.push({ enabled });
    }

    const query = filters.length > 0 ? { $and: filters } : {};
    const departments = await Department.find(query)
      .select('code name description parentDepartmentId managerUserId enabled sortOrder createdAt updatedAt')
      .sort({ sortOrder: 1, name: 1, _id: 1 })
      .lean<DepartmentRecord[]>();

    return res.status(200).json({
      departments: departments.map(sanitizeDepartment),
    });
  } catch (error) {
    return handleAdminDepartmentError(error, res, '[getAdminDepartments]');
  }
}

export async function getAdminDepartment(req: Request, res: Response) {
  try {
    const departmentId = parseObjectId(req.params.departmentId, 'departmentId');
    const department = await Department.findById(departmentId)
      .select('code name description parentDepartmentId managerUserId enabled sortOrder createdAt updatedAt')
      .lean<DepartmentRecord | null>();

    if (!department) {
      throw createStatusError(404, 'Department not found');
    }

    return res.status(200).json(sanitizeDepartment(department));
  } catch (error) {
    return handleAdminDepartmentError(error, res, '[getAdminDepartment]');
  }
}

export async function createAdminDepartment(req: Request, res: Response) {
  try {
    const input = adminDepartmentCreateSchema.parse(req.body);
    const existingDepartment = await Department.findOne({ code: input.code }).select('_id').lean();
    if (existingDepartment) {
      throw createStatusError(409, 'A department with this code already exists');
    }

    const write = await buildDepartmentWrite(input);
    const createdDepartment = await Department.create({
      code: input.code,
      ...write,
    });
    const department = await Department.findById(createdDepartment._id)
      .select('code name description parentDepartmentId managerUserId enabled sortOrder createdAt updatedAt')
      .lean<DepartmentRecord | null>();

    if (!department) {
      throw createStatusError(500, 'Failed to load created department');
    }

    await writeDepartmentActivityLog(req, 'department.create', 'success', department._id.toString());

    return res.status(201).json(sanitizeDepartment(department));
  } catch (error) {
    await writeDepartmentActivityLog(
      req,
      'department.create',
      'failure',
      null,
      error instanceof Error ? error.message : 'Failed to create department',
    );
    return handleAdminDepartmentError(error, res, '[createAdminDepartment]');
  }
}

export async function updateAdminDepartment(req: Request, res: Response) {
  try {
    const departmentId = parseObjectId(req.params.departmentId, 'departmentId');
    const input = adminDepartmentUpdateSchema.parse(req.body);
    const existingDepartment = await Department.findById(departmentId)
      .select('_id')
      .lean<Pick<DepartmentRecord, '_id'> | null>();

    if (!existingDepartment) {
      throw createStatusError(404, 'Department not found');
    }

    const write = await buildDepartmentWrite(input);
    if (
      write.parentDepartmentId instanceof mongoose.Types.ObjectId &&
      write.parentDepartmentId.equals(departmentId)
    ) {
      throw createStatusError(400, 'Department cannot be its own parent');
    }

    const updatedDepartment = await Department.findByIdAndUpdate(
      departmentId,
      { $set: write },
      { new: true },
    )
      .select('code name description parentDepartmentId managerUserId enabled sortOrder createdAt updatedAt')
      .lean<DepartmentRecord | null>();

    if (!updatedDepartment) {
      throw createStatusError(404, 'Department not found');
    }

    await writeDepartmentActivityLog(req, 'department.update', 'success', departmentId.toString());

    return res.status(200).json(sanitizeDepartment(updatedDepartment));
  } catch (error) {
    await writeDepartmentActivityLog(
      req,
      'department.update',
      'failure',
      typeof req.params.departmentId === 'string' ? req.params.departmentId : null,
      error instanceof Error ? error.message : 'Failed to update department',
    );
    return handleAdminDepartmentError(error, res, '[updateAdminDepartment]');
  }
}

export async function disableAdminDepartment(req: Request, res: Response) {
  try {
    const departmentId = parseObjectId(req.params.departmentId, 'departmentId');
    const department = await Department.findByIdAndUpdate(
      departmentId,
      { $set: { enabled: false } },
      { new: true },
    )
      .select('code name description parentDepartmentId managerUserId enabled sortOrder createdAt updatedAt')
      .lean<DepartmentRecord | null>();

    if (!department) {
      throw createStatusError(404, 'Department not found');
    }

    await writeDepartmentActivityLog(req, 'department.disable', 'success', departmentId.toString());

    return res.status(200).json(sanitizeDepartment(department));
  } catch (error) {
    await writeDepartmentActivityLog(
      req,
      'department.disable',
      'failure',
      typeof req.params.departmentId === 'string' ? req.params.departmentId : null,
      error instanceof Error ? error.message : 'Failed to disable department',
    );
    return handleAdminDepartmentError(error, res, '[disableAdminDepartment]');
  }
}
