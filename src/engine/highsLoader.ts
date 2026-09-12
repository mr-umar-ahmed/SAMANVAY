/**
 * Loader for the HiGHS mixed-integer solver (npm `highs`, HiGHS compiled to
 * WebAssembly) used by the MILP construction in milp.js.
 *
 * Vite emits highs.wasm as a hashed asset through the `?url` import below
 * (the package exports it as `highs/runtime`), and `locateFile` points the
 * Emscripten loader at that URL, so the same code works in `vite dev`, in the
 * production build and offline (the PWA precaches *.wasm). Loading is
 * asynchronous; every solve after that is synchronous. The instance is cached
 * per worker; a failed load is not cached, so a later call retries.
 *
 * Node (tests, CLI) does not need this file: `import loadHighs from 'highs'`
 * finds highs.wasm next to the package loader on its own.
 */
import highsLoader, { type Highs } from 'highs';
import highsWasmUrl from 'highs/runtime?url';

let pending: Promise<Highs> | null = null;

export async function loadHighs(): Promise<Highs> {
  if (!pending) {
    pending = highsLoader({
      locateFile: (file: string) => (file.endsWith('.wasm') ? highsWasmUrl : file),
    }).catch((err: unknown) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}

export type { Highs };
