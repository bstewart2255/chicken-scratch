import { build } from 'esbuild';

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

console.log('SDK built successfully.');
