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
  getStats(pluginTitle, callback) {
    apiRequest(
      'GET',
      `/stats/${encodeURIComponent(pluginTitle)}`,
      null,
      callback,
    );
  },
  getAllStats(callback) {
    apiRequest('GET', '/stats', null, callback);
  },
  getStatsBatch(pluginTitles, callback) {
    const titles = pluginTitles
      .map(t => encodeURIComponent(t))
      .join(',');
    apiRequest('GET', `/stats?titles=${titles}`, null, callback);
  },
  submitRating(pluginTitle, rating, callback) {
    authenticatedRequest(
      'POST',
      `/rate/${encodeURIComponent(pluginTitle)}`,
      { rating },
      callback,
    );
  },
  getChangelog(pluginTitle, callback) {
    apiRequest(
      'GET',
      `/changelog/${encodeURIComponent(pluginTitle)}`,
      null,
      callback,
    );
  },
  getComments(pluginTitle, callback) {
    apiRequest(
      'GET',
      `/comments/${encodeURIComponent(pluginTitle)}`,
      null,
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
  getCompatibilityReports(pluginTitle, callback) {
    apiRequest(
      'GET',
      `/compatibility/${encodeURIComponent(pluginTitle)}`,
      null,
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
  checkAuthStatus(callback) {
    authenticatedRequest('GET', '/auth/status', null, callback);
  },
  getAuthConfig(callback) {
    apiRequest('GET', '/auth/config', null, callback);
  },
  logout() {
    setJwtToken(null);
    authenticatedRequest('POST', '/auth/logout', null, () => undefined);
  },
  getPendingComments(callback) {
    authenticatedRequest('GET', '/comments/pending', null, callback);
  },
  getAllRecentComments(callback) {
    apiRequest('GET', '/comments/all-recent', null, callback);
  },
  moderateComment(pluginTitle, commentId, status, callback) {
    authenticatedRequest(
      'PUT',
      `/comments/${encodeURIComponent(pluginTitle)}/${encodeURIComponent(commentId)}`,
      { status },
      callback,
    );
  },
  getPendingCompatibilityReports(callback) {
    authenticatedRequest('GET', '/compatibility/pending', null, callback);
  },
  moderateCompatibilityReport(pluginTitle, reportId, status, callback) {
    authenticatedRequest(
      'PUT',
      `/compatibility/${encodeURIComponent(pluginTitle)}/${encodeURIComponent(reportId)}`,
      { status },
      callback,
    );
  },
});
