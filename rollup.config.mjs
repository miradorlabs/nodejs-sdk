import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import dts from 'rollup-plugin-dts';

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
      }),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.build.json',
        declaration: false,
        sourceMap: true,
      }),
    ],
    external: [
      '@grpc/grpc-js',
      'google-protobuf',
      'mirador-gateway-ingest',
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
      'mirador-gateway-ingest',
      'rxjs',
      /^rxjs\/.*/,
    ],
  },
];
