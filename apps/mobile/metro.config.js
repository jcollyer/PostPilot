// Metro config tuned for an npm-workspaces monorepo.
//
// Two things are required so Metro (a) watches our workspace packages for
// changes, and (b) can resolve hoisted dependencies from the repo root.

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the whole monorepo so edits to @saas/api etc. reload the app.
config.watchFolders = [workspaceRoot];

// 2. Let Metro resolve modules from both the app's node_modules and the root's.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = withNativeWind(config, { input: './global.css' });
