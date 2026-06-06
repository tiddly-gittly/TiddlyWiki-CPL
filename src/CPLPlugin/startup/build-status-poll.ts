/**
 * Polls the /cpl/build-status endpoint and updates temp tiddlers
 * so the build-status-badge widget can reactively display build progress.
 *
 * Polls every 5 seconds when the status is not "idle". Stops polling
 * once idle to save resources.
 */
import { tw, type JsonObject } from './api-client/types';
import { rawApiRequest } from './api-client/http';
import { getConfiguredMirrorType } from './api-client/state';

const POLL_INTERVAL = 5000;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const setBuildStatus = (phase: string, message: string): void => {
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/build-status',
    text: phase,
  });
  tw.wiki.addTiddler({
    title: '$:/temp/CPL-Server/build-status-message',
    text: message,
  });
};

const pollBuildStatus = (): void => {
  // When using a static mirror, the build-status endpoint is irrelevant —
  // skip the request and clear any stale badge so users aren't confused.
  if (getConfiguredMirrorType() !== 'server') {
    setBuildStatus('idle', '');
    return;
  }

  rawApiRequest<JsonObject>('GET', '/build-status', null, (error, data) => {
    if (error) {
      // If the build-status endpoint fails (e.g. server restarting),
      // show a transient "restarting" state
      setBuildStatus('restarting', 'Server is restarting...');
      return;
    }

    const phase = String(data?.phase ?? 'idle');
    const message = String(data?.message ?? '');

    setBuildStatus(phase, message);

    // Stop polling once idle
    if (phase === 'idle' && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
};

export const startBuildStatusPolling = (): void => {
  // Initial poll
  pollBuildStatus();

  // Start periodic polling
  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = setInterval(pollBuildStatus, POLL_INTERVAL);
};

export const stopBuildStatusPolling = (): void => {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
};
