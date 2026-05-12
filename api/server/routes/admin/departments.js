const express = require('express');
const { requireAdmin, requireAdminDataAccess } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  createAdminDepartment,
  disableAdminDepartment,
  getAdminDepartment,
  getAdminDepartments,
  updateAdminDepartment,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth);

router.get('/', requireAdminDataAccess, getAdminDepartments);
router.post('/', requireAdmin, createAdminDepartment);
router.use(requireAdmin);
router.get('/:departmentId', getAdminDepartment);
router.patch('/:departmentId', updateAdminDepartment);
router.delete('/:departmentId', disableAdminDepartment);

module.exports = router;
