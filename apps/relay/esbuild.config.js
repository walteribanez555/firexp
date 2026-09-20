const esbuild = require('esbuild');

const isProduction = process.argv.includes('--prod');

const config = {
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  minify: isProduction,
  sourcemap: !isProduction,
  target: 'node24',
  platform: 'node',
  logLevel: 'info',
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
  },
};

const build = async () => {
  await esbuild.build(config);
  console.log(`✓ Built dist/main.js`);
  console.log(`  Environment: ${isProduction ? 'production (minified)' : 'development (sourcemap)'}`);
};

build().catch((error) => {
  console.error('✗ Build failed:', error);
  process.exit(1);
});

module.exports = { config, build };
