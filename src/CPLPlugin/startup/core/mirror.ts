import {
  CURRENT_REPO_TITLE,
  getCurrentRepoEntry,
  resetBridge,
  setPreviousRepoEntry,
} from './bridge';
import { tw } from './types';

interface MirrorControllerOptions {
  isBusy: () => boolean;
  onSwitchRequested: () => void;
}

export interface MirrorController {
  handleMirrorSwitch: (newEntry: string, oldEntry: string) => void;
  setMirrorSwitchStatus: (status: string, message: string) => void;
  completePendingSwitch: () => void;
  failPendingSwitch: (message: string) => void;
}

export const createMirrorController = ({
  isBusy,
  onSwitchRequested,
}: MirrorControllerOptions): MirrorController => {
  let mirrorSwitchInternalChange = false;
  let mirrorSwitchPending = false;

  const setMirrorSwitchStatus = (status: string, message: string): void => {
    tw.wiki.addTiddler({
      title: '$:/temp/CPL-Repo/mirror-switch-status',
      text: status || '',
      message: message || '',
      repo: getCurrentRepoEntry(),
      timestamp: String(Date.now()),
    });
  };

  const clearTempRepoState = (): void => {
    for (const title of tw.wiki.filterTiddlers('[prefix[$:/temp/CPL-Repo/]]')) {
      tw.wiki.deleteTiddler(title);
    }
  };

  const handleMirrorSwitch = (newEntry: string, oldEntry: string): void => {
    if (newEntry === oldEntry || mirrorSwitchInternalChange) {
      return;
    }

    if (isBusy()) {
      mirrorSwitchInternalChange = true;
      tw.wiki.addTiddler({ title: CURRENT_REPO_TITLE, text: oldEntry });
      mirrorSwitchInternalChange = false;
      setMirrorSwitchStatus('blocked', 'Mirror switching is unavailable while CPL is busy.');
      return;
    }

    mirrorSwitchPending = true;
    clearTempRepoState();
    setMirrorSwitchStatus('switching', 'Switching mirror and reloading plugin data...');
    resetBridge();
    setPreviousRepoEntry(newEntry);
    setTimeout(() => {
      onSwitchRequested();
    }, 0);
  };

  const completePendingSwitch = (): void => {
    if (mirrorSwitchPending) {
      mirrorSwitchPending = false;
      setMirrorSwitchStatus('success', 'Mirror switched successfully.');
      return;
    }

    setMirrorSwitchStatus('ready', '');
  };

  const failPendingSwitch = (message: string): void => {
    if (!mirrorSwitchPending) {
      return;
    }

    mirrorSwitchPending = false;
    setMirrorSwitchStatus('error', String(message || 'Failed to switch mirror'));
  };

  return {
    handleMirrorSwitch,
    setMirrorSwitchStatus,
    completePendingSwitch,
    failPendingSwitch,
  };
};