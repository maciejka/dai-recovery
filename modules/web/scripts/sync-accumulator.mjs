import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sourcePath = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'accumulator.json',
);
const destinationPath = resolve(__dirname, '..', 'public', 'accumulator.json');

try {
  await mkdir(resolve(__dirname, '..', 'public'), { recursive: true });
  await copyFile(sourcePath, destinationPath);
  console.log(`Synced ${sourcePath} -> ${destinationPath}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    'Failed to sync accumulator artifact. Run `bun run build:merkle` first.',
  );
  console.error(message);
  process.exitCode = 1;
}
