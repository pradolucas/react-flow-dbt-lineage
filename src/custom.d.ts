// src/custom.d.ts

// This file tells TypeScript how to handle imports for CSS Modules.
// Any file ending in .module.css will be treated as a module
// that exports an object with string keys and string values.

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
