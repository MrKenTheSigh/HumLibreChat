const { logger } = require('@librechat/data-schemas');

const connectionsByUserId = new Map();

function normalizeUserId(userId) {
  return userId == null ? '' : userId.toString();
}

function writeSSE(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function addFileEventConnection({ userId, res }) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return () => {};
  }

  const connections = connectionsByUserId.get(normalizedUserId) ?? new Set();
  connections.add(res);
  connectionsByUserId.set(normalizedUserId, connections);

  return () => {
    connections.delete(res);
    if (connections.size === 0) {
      connectionsByUserId.delete(normalizedUserId);
    }
  };
}

function emitFileProcessingEvent({ userId, event }) {
  const normalizedUserId = normalizeUserId(userId);
  const connections = connectionsByUserId.get(normalizedUserId);
  if (!connections || connections.size === 0) {
    logger.warn(
      `[fileEvents] No active file event connections for user "${normalizedUserId}" while emitting "${event?.status ?? event?.type ?? 'unknown'}".`,
    );
    return;
  }

  const payload = {
    type: 'file_processing_status',
    ...event,
  };

  for (const res of connections) {
    try {
      writeSSE(res, payload);
    } catch (error) {
      logger.warn('[fileEvents] Failed to write file processing event:', error);
    }
  }
}

function getFileEventConnectionCount(userId) {
  return connectionsByUserId.get(normalizeUserId(userId))?.size ?? 0;
}

function clearFileEventConnections() {
  connectionsByUserId.clear();
}

module.exports = {
  addFileEventConnection,
  emitFileProcessingEvent,
  getFileEventConnectionCount,
  clearFileEventConnections,
};
