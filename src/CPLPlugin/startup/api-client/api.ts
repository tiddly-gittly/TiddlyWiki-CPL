import { type CPLServerApi } from './types';
import { apiRequest, authenticatedRequest } from './http';
import { setJwtToken } from './auth';

export const createCplServerApi = (): CPLServerApi => ({
  recordDownload(pluginTitle, callback) {
    apiRequest(
      'POST',
      `/download/${encodeURIComponent(pluginTitle)}`,
      null,
      callback,
    );
  },
  submitRating(pluginTitle, rating, callback) {
    authenticatedRequest(
      'POST',
      `/rate/${encodeURIComponent(pluginTitle)}`,
      { rating },
      callback,
    );
  },
  submitComment(pluginTitle, content, callback) {
    authenticatedRequest(
      'POST',
      `/comments/${encodeURIComponent(pluginTitle)}`,
      { content },
      callback,
    );
  },
  submitCompatibilityReport(pluginTitle, payload, callback) {
    authenticatedRequest(
      'POST',
      `/compatibility/${encodeURIComponent(pluginTitle)}`,
      payload,
      callback,
    );
  },
  logout() {
    setJwtToken(null);
    authenticatedRequest('POST', '/auth/logout', null, () => undefined);
  },
  moderateComment(pluginTitle, commentId, status, callback) {
    authenticatedRequest(
      'PUT',
      `/comments/${encodeURIComponent(pluginTitle)}/${encodeURIComponent(
        commentId,
      )}`,
      { status },
      callback,
    );
  },
  moderateCompatibilityReport(pluginTitle, reportId, status, callback) {
    authenticatedRequest(
      'PUT',
      `/compatibility/${encodeURIComponent(pluginTitle)}/${encodeURIComponent(
        reportId,
      )}`,
      { status },
      callback,
    );
  },
});
