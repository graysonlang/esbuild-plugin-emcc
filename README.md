# esbuild-plugin-emcc

A plugin for [esbuild](https://github.com/evanw/esbuild) that adds support for compiling C/C++ files with [Emscripten](https://emscripten.org/) into WebAssembly `.wasm` files.

## Basic Usage

1. Install this plugin in your project:

  ```sh
  npm install --save-dev esbuild-plugin-emcc
  ```

2. Add this plugin to your esbuild build script using ES Module import
    ```diff
    +import emccPlugin from 'esbuild-plugin-emcc';
    ```
    or CommonJS require syntax:
    ```diff
    +const emccPlugin = require('esbuild-plugin-emcc');
    ```
    ```diff
    esbuild.build({
      ...
      plugins: [
    +   emccPlugin(),
      ],
      ...
    })
    ```

3. Import your `*.cpp` files from JavaScript, optionally specifying compiler options or additional sources:

    ```js
    import MainModule from './main.cpp';
    const mainModuleInstance = await MainModule();
    const result = mainModuleInstance._cppFunction(100, "cool", true);

    import otherModule from './foo.cpp' with {
      options: '-Oz -I. -I./bar -I./baz',
      sources: './bar/bar.cpp ./baz/baz.cpp',
    };
    ```

## Options

The plugin method takes an object with two fields, `emccPath` and `emccFlags`.

#### `emccPath: String` (default: `"emcc"`)

Allows for setting the explicit path/name of the emscripten compiler.

#### `emccFlags: [String]` (default: `[]`)

Allows customization of the global emcc compiler flags used across all files that are compiled. For entry-point specific flags, use the `with: { options: '' }` syntax within the import directive.

```js
// Additional compiler options for emcc.
const emccOptions = [
  '-sALLOW_MEMORY_GROWTH=1',
  '-sEXPORTED_FUNCTIONS=[_free,_malloc]',
  // Embeds generated .wasm as base-64 in generate .mjs file.
  '-sSINGLE_FILE',
  // Change the optimization (default is -Os).
  '-O3',
];
```

### Usage:

```diff
  esbuild.build({
  ...
  plugins: [
-    emccPlugin(),
+    emccPlugin({ emccPath: 'em++', emccOptions: emccOptions }),
  ],
  })
];
```
