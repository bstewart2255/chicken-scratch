import { build } from 'esbuild';
import { execSync } from 'child_process';

const shared = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  sourcemap: true,
  target: 'es2020',
  minify: true,
};

// ESM build
await build({
  ...shared,
  format: 'esm',
  outfile: 'dist/chicken-scratch.mjs',
});

// IIFE build (for <script> tag — exposes window.ChickenScratch)
await build({
  ...shared,
  format: 'iife',
  globalName: 'ChickenScratchSDK',
  outfile: 'dist/chicken-scratch.js',
  footer: {
    js: 'if(typeof window!=="undefined"){window.ChickenScratch=ChickenScratchSDK.ChickenScratch;}',
  },
});

// Type declarations — tsconfig.json has emitDeclarationOnly + declarationDir,
// so this writes dist/index.d.ts and friends without overwriting the JS bundles.
execSync('npx tsc', { stdio: 'inherit' });

console.log('SDK built successfully.');
