/// <reference types="@rsbuild/core/types" />

/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

// Zephyr public env vars are referenced via process.env in browser bundles.
declare const process: {
  env: {
    ZE_PUBLIC_FRAMES_BASE_URL?: string;
    ZE_PUBLIC_FRAME_REMOTE_TEMPLATE?: string;
  };
};
