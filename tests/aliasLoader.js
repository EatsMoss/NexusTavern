import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ALIAS_ENTRIES = [
  ['@app/', path.join(ROOT_DIR, 'src', 'app')],
  ['@ui/', path.join(ROOT_DIR, 'src', 'ui')],
  ['@core/', path.join(ROOT_DIR, 'src', 'core')],
  ['@features/', path.join(ROOT_DIR, 'src', 'features')],
  ['@styles/', path.join(ROOT_DIR, 'src', 'styles')],
  ['@assets/', path.join(ROOT_DIR, 'src', 'assets')],
  ['@/', path.join(ROOT_DIR, 'src')],
];

export async function resolve(specifier, context, nextResolve) {
  for (const [prefix, targetBase] of ALIAS_ENTRIES) {
    if (specifier.startsWith(prefix)) {
      const relativeSubpath = specifier.slice(prefix.length);
      const resolvedUrl = pathToFileURL(path.join(targetBase, relativeSubpath)).href;
      return nextResolve(resolvedUrl, context);
    }
  }
  return nextResolve(specifier, context);
}
