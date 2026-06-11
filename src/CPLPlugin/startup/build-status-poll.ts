/**
 * Polls build status via declarative BackgroundAction + tm-http-request,
 * then syncs response JSON into status tiddlers for the badge widget.
 *
 * Polls every 5 seconds when the status is not "idle". Stops polling
 * once idle to save resources.
 */
import { tw } from './types';
import {
  BUILD_STATUS_REFRESH_TITLE,
  BUILD_STATUS_RESPONSE_TITLE,
} from './constants';

const POLL_INTERVAL = 5000;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let statusSyncInitialized = false;

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

const triggerBuildStatusFetch = (): void => {
  tw.wiki.addTiddler({
    title: BUILD_STATUS_REFRESH_TITLE,
    text: String(Date.now()),
  });
};

const parseResponse = (): { phase: string; message: string } | null => {
  const response = tw.wiki.getTiddlerText(BUILD_STATUS_RESPONSE_TITLE, '');
  if (!response) {
    return null;
  }

  try {
    const parsed = JSON.parse(response) as {
      phase?: unknown;
      message?: unknown;
    };
    return {
      phase: String(parsed.phase ?? 'idle'),
      message: String(parsed.message ?? ''),
    };
  } catch {
    return null;
  }
};

const setupBuildStatusSync = (): void => {
  if (statusSyncInitialized) {
    return;
  }
  statusSyncInitialized = true;

  tw.wiki.addEventListener('change', changes => {
    if (!$tw.utils.hop(changes, BUILD_STATUS_RESPONSE_TITLE)) {
      return;
    }

    const data = parseResponse();
    if (!data) {
      setBuildStatus('restarting', 'Server is restarting...');
      return;
    }

    setBuildStatus(data.phase, data.message);

    if (data.phase === 'idle' && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  });
};

export const pollBuildStatus = (): void => {
  // When using a static mirror, the build-status endpoint is irrelevant —
  // skip the request and clear any stale badge so users aren't confused.
  if (
    tw.wiki.getTiddlerText('$:/temp/CPL-Repo/mirror-type', 'unknown') !==
    'server'
  ) {
    setBuildStatus('idle', '');
    return;
  }

  triggerBuildStatusFetch();
};

export const startBuildStatusPolling = (): void => {
  setupBuildStatusSync();

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
