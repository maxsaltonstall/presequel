import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The server/ directory's parent is the project root.
const __projectRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

export const CONTENT_ROOT = resolve(__projectRoot, 'content');
