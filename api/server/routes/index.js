const accessPermissions = require('./accessPermissions');
const assistants = require('./assistants');
const categories = require('./categories');
const adminAuth = require('./admin/auth');
const adminActivityLogs = require('./admin/activity-logs');
const adminChannelInventory = require('./admin/channelInventory');
const adminChannels = require('./admin/channels');
const adminPlans = require('./admin/plans');
const adminQuotas = require('./admin/quotas');
const adminRoles = require('./admin/roles');
const adminManagerReviews = require('./admin/manager-reviews');
const adminUsers = require('./admin/users');
const adminConversations = require('./admin/conversations');
const adminDepartments = require('./admin/departments');
const adminUsage = require('./admin/usage');
const managerReviews = require('./manager-reviews');
const endpoints = require('./endpoints');
const staticRoute = require('./static');
const messages = require('./messages');
const memories = require('./memories');
const presets = require('./presets');
const prompts = require('./prompts');
const balance = require('./balance');
const actions = require('./actions');
const apiKeys = require('./apiKeys');
const banner = require('./banner');
const search = require('./search');
const models = require('./models');
const convos = require('./convos');
const config = require('./config');
const agents = require('./agents');
const roles = require('./roles');
const oauth = require('./oauth');
const files = require('./files');
const share = require('./share');
const tags = require('./tags');
const auth = require('./auth');
const keys = require('./keys');
const user = require('./user');
const mcp = require('./mcp');

module.exports = {
  mcp,
  auth,
  adminAuth,
  adminActivityLogs,
  adminChannelInventory,
  adminChannels,
  adminPlans,
  adminQuotas,
  adminRoles,
  adminManagerReviews,
  adminUsers,
  adminConversations,
  adminDepartments,
  adminUsage,
  managerReviews,
  keys,
  apiKeys,
  user,
  tags,
  roles,
  oauth,
  files,
  share,
  banner,
  agents,
  convos,
  search,
  config,
  models,
  prompts,
  actions,
  presets,
  balance,
  messages,
  memories,
  endpoints,
  assistants,
  categories,
  staticRoute,
  accessPermissions,
};
