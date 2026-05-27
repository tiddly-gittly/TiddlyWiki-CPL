import * as fs from 'fs';
import * as http from 'http';
import * as https from 'https';

const DEFAULT_TIMEOUT_MS = 30000;

export const downloadFile = async (
  url: string,
  destinationPath: string,
  redirectCount = 0,
): Promise<void> => {
  if (redirectCount > 10) {
    throw new Error(`Too many redirects while downloading ${url}`);
  }

  const client = url.startsWith('https:') ? https : http;

  await new Promise<void>((resolve, reject) => {
    const request = client.get(url, response => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        void downloadFile(
          response.headers.location,
          destinationPath,
          redirectCount + 1,
        )
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      const output = fs.createWriteStream(destinationPath);
      response.pipe(output);

      output.on('finish', () => {
        output.close();
        resolve();
      });

      output.on('error', error => {
        fs.unlink(destinationPath, unlinkError => {
          if (unlinkError) {
            console.warn(
              `Failed to remove incomplete download ${destinationPath}:`,
              unlinkError.message,
            );
          }
        });
        reject(error);
      });
    });

    request.on('error', reject);
    request.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      request.destroy(new Error(`Request timeout for ${url}`));
    });
  });
};
