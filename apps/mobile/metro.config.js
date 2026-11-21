// expo/metro-config sets up npm-workspaces monorepos automatically (watching
// the repo root and resolving hoisted node_modules), so only NativeWind is added.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
