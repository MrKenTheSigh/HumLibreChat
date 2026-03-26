const { handleError, resolveUserEntitlements, isPairAllowed } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { logViolation } = require('~/cache');

const PLAN_MODEL_FORBIDDEN = 'PLAN_MODEL_FORBIDDEN';
/**
 * Validates the model of the request.
 *
 * @async
 * @param {ServerRequest} req - The Express request object.
 * @param {Express.Response} res - The Express response object.
 * @param {Function} next - The Express next function.
 */
const validateModel = async (req, res, next) => {
  const { model, endpoint } = req.body;
  if (!model) {
    return handleError(res, { text: 'Model not provided' });
  }

  const modelsConfig = await getModelsConfig(req);

  if (!modelsConfig) {
    return handleError(res, { text: 'Models not loaded' });
  }

  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return handleError(res, { text: 'Endpoint models not loaded' });
  }

  let validModel = !!availableModels.find((availableModel) => availableModel === model);

  if (validModel) {
    try {
      const entitlements = await resolveUserEntitlements({
        userId: req.user.id,
        role: req.user.role,
      });

      if (isPairAllowed(entitlements, endpoint, model)) {
        return next();
      }

      return res.status(403).json({
        message: 'Model is not allowed for the current plan',
        error_code: PLAN_MODEL_FORBIDDEN,
      });
    } catch (error) {
      const statusCode =
        error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
          ? error.statusCode
          : 500;
      const message =
        error instanceof Error ? error.message : 'Failed to resolve model access rules';
      return res.status(statusCode).json({ message });
    }
  }

  const { ILLEGAL_MODEL_REQ_SCORE: score = 1 } = process.env ?? {};

  const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
  const errorMessage = {
    type,
  };

  await logViolation(req, res, type, errorMessage, score);
  return handleError(res, { text: 'Illegal model request' });
};

module.exports = validateModel;
