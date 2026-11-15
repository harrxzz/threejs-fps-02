import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') {
    const modulePath = process.env.THREE_MODULE || 'vendor/three/three.module.min.js';
    return nextResolve(pathToFileURL(resolvePath(modulePath)).href, context);
  }
  return nextResolve(specifier, context);
}
