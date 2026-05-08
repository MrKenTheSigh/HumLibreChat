import { logger } from '@librechat/data-schemas';
import { SystemRoles } from 'librechat-data-provider';
import type { NextFunction, Response } from 'express';
import type { ServerRequest } from '~/types/http';

const adminDataRoles = new Set<string>([
  SystemRoles.ADMIN,
  SystemRoles.AUDITOR,
  SystemRoles.MANAGER,
]);

/**
 * Middleware to check if authenticated user has admin role.
 * Should be used AFTER authentication middleware (requireJwtAuth, requireLocalAuth, etc.)
 */
export const requireAdmin = (req: ServerRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    logger.warn('[requireAdmin] No user found in request');
    return res.status(401).json({
      error: 'Authentication required',
      error_code: 'AUTHENTICATION_REQUIRED',
    });
  }

  if (!req.user.role || req.user.role !== SystemRoles.ADMIN) {
    logger.debug(`[requireAdmin] Access denied for non-admin user: ${req.user.email}`);
    return res.status(403).json({
      error: 'Access denied: Admin privileges required',
      error_code: 'ADMIN_REQUIRED',
    });
  }

  next();
};

export const requireAdminDataAccess = (
  req: ServerRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user) {
    logger.warn('[requireAdminDataAccess] No user found in request');
    return res.status(401).json({
      error: 'Authentication required',
      error_code: 'AUTHENTICATION_REQUIRED',
    });
  }

  if (!req.user.role || !adminDataRoles.has(req.user.role)) {
    logger.debug(`[requireAdminDataAccess] Access denied for user: ${req.user.email}`);
    return res.status(403).json({
      error: 'Access denied: Admin data access role required',
      error_code: 'ADMIN_DATA_ACCESS_REQUIRED',
    });
  }

  next();
};
