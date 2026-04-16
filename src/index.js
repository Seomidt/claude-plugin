'use strict';

const PluginManager = require('./plugin-manager');
const { parseSpecifier, resolveRegistry, BUILTIN_REGISTRIES } = require('./registry');
const { readManifest, loadPlugin, activatePlugin, deactivatePlugin } = require('./plugin-loader');

module.exports = {
  PluginManager,
  parseSpecifier,
  resolveRegistry,
  BUILTIN_REGISTRIES,
  readManifest,
  loadPlugin,
  activatePlugin,
  deactivatePlugin,
};
