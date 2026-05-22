import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';
import ts from 'typescript';

/**
 * Transpiles the TypeScript-source proto stubs shipped by mirador-gateway-ingest.
 * That package publishes only `.ts` for the ts_proto-generated stubs (no compiled
 * `.js`), so they must be transpiled here to be bundled into the CJS output.
 * Without this, dist/index.js would `require()` a `.ts` file that Node's
 * CommonJS loader cannot resolve (MODULE_NOT_FOUND for every consumer).
 */
function transpileDepTs() {
  return {
    name: 'transpile-dep-ts',
    transform(code, id) {
      if (!id.includes('node_modules/mirador-gateway-ingest/') || !id.endsWith('.ts')) {
        return null;
      }
      const { outputText, sourceMapText } = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2020,
          sourceMap: true,
        },
      });
      return { code: outputText, map: sourceMapText ?? null };
    },
  };
}

export default [
  // Bundle the JavaScript/TypeScript code
  {
    input: 'index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
    plugins: [
      resolve({
        preferBuiltins: true,
        extensions: ['.mjs', '.js', '.json', '.node', '.ts'],
      }),
      commonjs(),
      transpileDepTs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        sourceMap: true,
      }),
    ],
    // mirador-gateway-ingest is intentionally NOT external: it ships its proto
    // stubs as raw `.ts`, so they are bundled in (see transpileDepTs above).
    // @bufbuild/protobuf is a real npm package with a CJS entry — keep external.
    external: [
      '@grpc/grpc-js',
      'google-protobuf',
      '@miradorlabs/plugins',
      '@bufbuild/protobuf',
      /^@bufbuild\/protobuf\/.*/,
      'rxjs',
      /^rxjs\/.*/,
    ],
  },
  // Bundle the TypeScript declarations
  {
    input: 'index.ts',
    output: {
      file: 'dist/index.d.ts',
      format: 'es',
    },
    plugins: [dts()],
    external: [
      '@grpc/grpc-js',
      'google-protobuf',
      '@miradorlabs/plugins',
      'mirador-gateway-ingest',
      /^mirador-gateway-ingest\/.*/,
      'rxjs',
      /^rxjs\/.*/,
    ],
  },
];
