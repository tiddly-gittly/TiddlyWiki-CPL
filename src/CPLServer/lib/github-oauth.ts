import * as https from 'https';
import * as querystring from 'querystring';
import { HttpsProxyAgent } from 'https-proxy-agent';

import { Config } from './config';
import type { GitHubTokenResponse, GitHubUserProfile } from './types';

const proxyUrl =
  process.env.CPL_HTTPS_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

const requestJson = <T>(
  options: https.RequestOptions,
  body?: string,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const request = https.request(
      proxyAgent ? { ...options, agent: proxyAgent } : options,
      response => {
        let data = '';
        const statusCode = response.statusCode ?? 0;

        response.on('data', chunk => {
          data += typeof chunk === 'string' ? chunk : chunk.toString();
        });

        response.on('end', () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`HTTP ${statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data) as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.setTimeout(15000, () => {
      request.destroy(new Error('GitHub OAuth request timed out'));
    });
    request.on('error', reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });

export const GitHubOAuth = {
  async exchangeCode(code: string): Promise<GitHubTokenResponse> {
    const postData = querystring.stringify({
      client_id: Config.githubClientId,
      client_secret: Config.githubClientSecret,
      code,
    });

    return requestJson<GitHubTokenResponse>(
      {
        hostname: 'github.com',
        path: '/login/oauth/access_token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'Content-Length': String(Buffer.byteLength(postData)),
        },
      },
      postData,
    );
  },

  async fetchUser(accessToken: string): Promise<GitHubUserProfile> {
    return requestJson<GitHubUserProfile>({
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'TiddlyWiki-CPL-Server',
        Accept: 'application/vnd.github.v3+json',
      },
    });
  },
};
