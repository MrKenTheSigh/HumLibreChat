const express = require('express');
const { requireAdmin } = require('@librechat/api');
const { requireJwtAuth } = require('~/server/middleware');
const {
  createAdminDepartment,
  disableAdminDepartment,
  getAdminDepartment,
  getAdminDepartments,
  updateAdminDepartment,
} = require('@librechat/api');

const router = express.Router();

router.use(requireJwtAuth, requireAdmin);

router.get('/', getAdminDepartments);
router.post('/', createAdminDepartment);
router.get('/:departmentId', getAdminDepartment);
router.patch('/:departmentId', updateAdminDepartment);
router.delete('/:departmentId', disableAdminDepartment);

module.exports = router;
