const esbuild = require('esbuild');

const isProduction = process.argv.includes('--prod');
const target       = process.argv.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'ecs';

// Lambda bundles src/lambda.ts → dist/index.js (CJS, no @hono/node-server)
// ECS / default bundles src/main.ts → dist/main.js
const isLambda = target === 'lambda';

const config = {
  entryPoints: [isLambda ? 'src/lambda.ts' : 'src/main.ts'],
  outfile:     isLambda ? 'dist/index.js' : 'dist/main.js',
  bundle:      true,
  minify:      isProduction,
  sourcemap:   !isProduction,
  // Match the Lambda runtime (nodejs20.x) so esbuild only uses node20-available APIs.
  // ECS/local will also run on >=20 so this is safe for both targets.
  target:      isLambda ? 'node20' : 'node22',
  platform:    'node',
  format:      isLambda ? 'cjs' : 'cjs',
  logLevel:    'info',
  // AWS SDK v3 is provided by the Lambda runtime layer and by the ECS task image;
  // exclude from bundle to keep artifact small and avoid version conflicts.
  external: [
    '@aws-sdk/*',
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
  },
};

const build = async () => {
  await esbuild.build(config);
  const label = isLambda ? 'Lambda (dist/index.js)' : 'ECS/local (dist/main.js)';
  console.log(`✓ Built ${label}`);
  console.log(`  Target:      ${target}`);
  console.log(`  Environment: ${isProduction ? 'production (minified)' : 'development (sourcemap)'}`);
};

build().catch((error) => {
  console.error('✗ Build failed:', error);
  process.exit(1);
});

module.exports = { config, build };
