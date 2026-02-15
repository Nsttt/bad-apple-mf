import { defineConfig } from '@rsbuild/core';

export default defineConfig(
  {
    server: {
      port: 4173,
    },
    html: {
      template: './public/index.html',
    },
    source: {
      // dummy entry; this app mostly exists to publish static assets in /public
      entry: {
        index: './src/index.ts',
      },
    },
    plugins: [],
  },
);
