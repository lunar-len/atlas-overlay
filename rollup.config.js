import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default [
    {
        input: 'node_modules/pmtiles/dist/esm/index.js',
        output: {
            file: 'lib/pmtiles/pmtiles-bundle.js',
            format: 'esm',
        },
        plugins: [resolve()]
    },
    {
        input: 'lib/turf/turf-entry.js',
        output: {
            file: 'lib/turf/turf-bundle.js',
            format: 'esm',
        },
        plugins: [
            resolve(),
            commonjs({
                include: /node_modules/,
                transformMixedEsModules: true
            })
        ]
    }
];
