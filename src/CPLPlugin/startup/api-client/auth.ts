import { JWT_TOKEN_KEY } from './constants';

export const getJwtToken = (): string | null => {
  try {
    return localStorage.getItem(JWT_TOKEN_KEY);
  } catch {
    return null;
  }
};

export const setJwtToken = (token: string | null): void => {
  try {
    if (token) {
      localStorage.setItem(JWT_TOKEN_KEY, token);
      return;
    }

    localStorage.removeItem(JWT_TOKEN_KEY);
  } catch (error) {
    console.error('[CPL-Server] Failed to access localStorage:', error);
  }
};
