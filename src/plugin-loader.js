'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = 'plugin.json';

/**
 * Reads and validates a plugin manifest from a directory.
 */
function readManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Missing ${MANIFEST_FILE} in ${pluginDir}`);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${manifestPath}: ${err.message}`);
  }

  validateManifest(manifest, manifestPath);
  return manifest;
}

function validateManifest(manifest, source) {
  const required = ['name', 'version', 'main'];
  for (const field of required) {
    if (!manifest[field]) {
      throw new Error(`Plugin manifest at ${source} is missing required field: "${field}"`);
    }
  }
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    throw new Error(`Plugin manifest at ${source} has invalid version: "${manifest.version}"`);
  }
}

/**
 * Loads a plugin from its directory and returns its module exports.
 * The plugin module must export activate(context) and optionally deactivate().
 */
function loadPlugin(pluginDir) {
  const manifest = readManifest(pluginDir);
  const mainPath = path.resolve(pluginDir, manifest.main);

  if (!fs.existsSync(mainPath)) {
    throw new Error(`Plugin main file not found: ${mainPath}`);
  }

  // Clear require cache to allow reloading updated plugins
  delete require.cache[require.resolve(mainPath)];
  const mod = require(mainPath);

  if (typeof mod.activate !== 'function') {
    throw new Error(`Plugin "${manifest.name}" must export an activate(context) function`);
  }

  return { manifest, mod };
}

/**
 * Activates a loaded plugin by calling its activate(context) function.
 */
function activatePlugin(pluginDir, context = {}) {
  const { manifest, mod } = loadPlugin(pluginDir);
  mod.activate(context);
  return manifest;
}

/**
 * Deactivates a plugin if it exports a deactivate() function.
 */
function deactivatePlugin(pluginDir) {
  const { manifest, mod } = loadPlugin(pluginDir);
  if (typeof mod.deactivate === 'function') {
    mod.deactivate();
  }
  return manifest;
}

module.exports = { readManifest, loadPlugin, activatePlugin, deactivatePlugin };
