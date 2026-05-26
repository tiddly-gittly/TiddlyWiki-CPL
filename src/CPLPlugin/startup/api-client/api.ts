import { type CPLServerApi, type JsonObject } from './types';
import { apiRequest, authenticatedRequest } from './http';
import { setJwtToken } from './auth';

export const createCplServerApi = (): CPLServerApi => ({
  recordDownload(pluginTitle, callback) {
    apiRequest('POST', `/download/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  getStats(pluginTitle, callback) {
    apiRequest('GET', `/stats/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  getAllStats(callback) {
    apiRequest('GET', '/stats', null, callback);
  },
  submitRating(pluginTitle, rating, callback) {
    apiRequest('POST', `/rate/${encodeURIComponent(pluginTitle)}`, { rating }, callback);
  },
  getChangelog(pluginTitle, callback) {
    apiRequest('GET', `/changelog/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  getComments(pluginTitle, callback) {
    apiRequest('GET', `/comments/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  submitComment(pluginTitle, content, callback) {
    authenticatedRequest('POST', `/comments/${encodeURIComponent(pluginTitle)}`, { content }, callback);
  },
  getCompatibilityReports(pluginTitle, callback) {
    apiRequest('GET', `/compatibility/${encodeURIComponent(pluginTitle)}`, null, callback);
  },
  submitCompatibilityReport(pluginTitle, payload, callback) {
    authenticatedRequest('POST', `/compatibility/${encodeURIComponent(pluginTitle)}`, payload, callback);
  },
  checkAuthStatus(callback) {
    authenticatedRequest('GET', '/auth/status', null, callback);
  },
  getAuthConfig(callback) {
    apiRequest('GET', '/auth/config', null, callback);
  },
  logout() {
    setJwtToken(null);
  },
});
