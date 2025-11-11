import resolve from '@rollup/plugin-node-resolve';

export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/canvas-editor.js',
        format: 'cjs',
        exports: 'named'
      },
      {
        file: 'dist/canvas-editor.esm.js',
        format: 'esm'
      },
      {
        file: 'dist/canvas-editor.umd.js',
        format: 'umd',
        name: 'CanvasEditor',
        exports: 'named'
      }
    ],
    plugins: [resolve()]
  }
];
