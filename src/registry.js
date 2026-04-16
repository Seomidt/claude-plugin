'use strict';

const BUILTIN_REGISTRIES = {
  'claude-plugins-official': {
    url: 'https://plugins.claude.ai/registry',
    description: 'Official Claude plugins registry',
  },
};

/**
 * Parses a plugin specifier like "superpowers@claude-plugins-official"
 * into { name, registry }.
 * Also handles local paths: "file:./path/to/plugin" → { name, localPath }.
 */
function parseSpecifier(specifier) {
  if (specifier.startsWith('file:')) {
    const localPath = specifier.slice(5);
    const name = require('path').basename(localPath);
    return { name, registry: null, localPath };
  }
  const atIdx = specifier.lastIndexOf('@');
  if (atIdx <= 0) {
    return { name: specifier, registry: 'claude-plugins-official' };
  }
  return {
    name: specifier.slice(0, atIdx),
    registry: specifier.slice(atIdx + 1),
  };
}

/**
 * Resolves a registry name to its configuration.
 * Custom registries can be passed via the registries map.
 */
function resolveRegistry(registryName, customRegistries = {}) {
  const registries = { ...BUILTIN_REGISTRIES, ...customRegistries };
  const entry = registries[registryName];
  if (!entry) {
    throw new Error(
      `Unknown registry "${registryName}". ` +
        `Available: ${Object.keys(registries).join(', ')}`
    );
  }
  return entry;
}

/**
 * Builds the URL used to fetch plugin metadata from a registry.
 */
function buildPluginUrl(registryUrl, pluginName) {
  const base = registryUrl.replace(/\/$/, '');
  return `${base}/plugins/${encodeURIComponent(pluginName)}`;
}

module.exports = { parseSpecifier, resolveRegistry, buildPluginUrl, BUILTIN_REGISTRIES };
