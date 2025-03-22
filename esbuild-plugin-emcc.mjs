import child_process from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';

import Freshness, { computeUrlSafeBase64Digest } from 'freshness';

const execFileAsync = util.promisify(child_process.execFile);

function parseSourcesString(input = '') {
  const elementRegex = /"([^"]*)"|'([^']*)'|[^\s]+/g;
  const result = [];
  let match;
  while ((match = elementRegex.exec(input)) !== null) {
    let token = match[0];
    if (token.startsWith('"') && token.endsWith('"') || (token.startsWith("'") && token.endsWith("'"))) {
      token = token.slice(1, -1);
    } else {
      token = token.replace(/\\ /g, ' ');
    }
    result.push(token);
  }
  return result;
}

const resolveFilter = /\.c(?:c|(?:pp)|(?:xx))?$/i
const pluginNamespace = 'emcc';

export default function emccPlugin({
  emccOptions = [],
  emccPath = 'emcc',
  verbose = false,
} = {}) {
  const _entryPoints = new Map();
  const _resolveDirs = new Map();
  const _freshness = new Freshness();
  return {
    name: 'emcc',
    setup(build) {
      build.onStart(() => {
        _entryPoints.clear();
        _resolveDirs.clear();
      });

      build.onResolve({ filter: resolveFilter }, (args) => {
        const filePath = path.relative('', path.join(args.resolveDir, args.path));
        _resolveDirs.set(filePath, args.resolveDir);
        return { path: filePath, namespace: pluginNamespace };
      });

      build.onLoad({ filter: /.*/, namespace: pluginNamespace }, async (args) => {
        const withDict = args.with || {};
        const options = withDict.options || '';
        const sources = withDict.sources ? parseSourcesString(withDict.sources) : [];

        // TODO: Handle merging array types (e.g. EXPORTED_FUNCTIONS) from global and local options.
        const allOptions = [...emccOptions, ...(options.split(/\s+/))];

        const importingDir = _resolveDirs.get(args.path);
        const primarySource = path.relative(importingDir, path.resolve('', args.path));
        const primarySources = [primarySource, ...sources];

        const watchFilesSet = new Set();
        for (const source of primarySources) {
          const includedFiles = new Set();

          const relPath = path.relative('', path.resolve(importingDir, source))

          const child = child_process.spawnSync(
            emccPath,
            // TODO: Pull out only the inclusion flags from allOptions.
            [`-MT${source}`, '-MP', '-MM', source, ...allOptions],
            { cwd: importingDir, encoding: 'utf8' }
          );
          if (child.error) {
            console.log(`ERROR: ${child.error}`);
          }
          let makefile = child.stdout.toString().replace(/\\\n/g, '').replace(/:.*[\n$]+/g, '\n').trim();
          let foundFiles = makefile.split('\n');

          foundFiles.forEach(file => {
            includedFiles.add(path.relative('', path.resolve(importingDir, file)));
          });

          _entryPoints.set(relPath, includedFiles);
          includedFiles.forEach(p => watchFilesSet.add(p));
        }

        const outDir = path.resolve('', build.initialOptions.outdir || path.dirname(build.initialOptions.outfile))

        const parsed = path.parse(args.path);
        const suffix = computeUrlSafeBase64Digest(args.path);
        const outFile = path.join(outDir, `${parsed.base}.${suffix}.mjs`);

        const needsRecompile = !(fs.existsSync(outFile) && await _freshness.check(watchFilesSet));
        if (needsRecompile) {
          if (verbose) {
            const compilingPaths = primarySources.map(source => path.relative('', path.resolve(importingDir, source)));
            console.log(`Compiling: ${compilingPaths.join(' ')}`);
          }
          const finalFlags = [
            ...primarySources,
            '-o', `${path.relative(importingDir, outFile)}`,
            '-Os',
            '-sENVIRONMENT=web',
            '-sEXPORT_ES6=1',
            '-sMODULARIZE=1',
            ...allOptions,
          ];
          try {
            await fs.promises.mkdir(outDir, { recursive: true });
            await execFileAsync(emccPath, finalFlags, { cwd: importingDir });
          } catch (error) {
            console.error(`Error compiling '${args.path}':`, error);
            throw error;
          }
        }

        return {
          contents: await fs.promises.readFile(outFile, 'utf8'),
          watchFiles: [...watchFilesSet],
          loader: 'js',
        };
      });

      build.onEnd(async () => {
        _freshness.update(new Set([..._entryPoints.values()].flatMap(set => [...set])));
      });
    },
  };
}
