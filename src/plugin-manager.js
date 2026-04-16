'use strict';

const fs = require('fs');
const path = require('path');
const { parseSpecifier, resolveRegistry, buildPluginUrl } = require('./registry');
const { readManifest, activatePlugin, deactivatePlugin } = require('./plugin-loader');

const PLUGINS_DIR_NAME = 'installed_plugins';
const LOCK_FILE_NAME = 'claude-plugin.lock';

class PluginManager {
  /**
   * @param {object} options
   * @param {string} options.baseDir      Working directory (default: cwd)
   * @param {object} options.registries   Additional registry configs
   * @param {object} options.logger       Logger with info/warn/error methods
   */
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.registries = options.registries || {};
    this.logger = options.logger || console;
    this.pluginsDir = path.join(this.baseDir, PLUGINS_DIR_NAME);
    this.lockFile = path.join(this.baseDir, LOCK_FILE_NAME);
    this._active = new Map(); // name -> manifest
  }

  // ── Lock file ────────────────────────────────────────────────────────────

  _readLock() {
    if (!fs.existsSync(this.lockFile)) return {};
    try {
      return JSON.parse(fs.readFileSync(this.lockFile, 'utf8'));
    } catch {
      return {};
    }
  }

  _writeLock(lock) {
    fs.writeFileSync(this.lockFile, JSON.stringify(lock, null, 2) + '\n', 'utf8');
  }

  // ── Install ───────────────────────────────────────────────────────────────

  /**
   * Installs a plugin from a specifier like "name@registry".
   * In a real implementation this would download the plugin package.
   * Here we create a stub directory so the system is fully functional offline.
   */
  async install(specifier) {
    const { name, registry: registryName } = parseSpecifier(specifier);
    const registryConfig = resolveRegistry(registryName, this.registries);

    this.logger.info(`Installing ${name} from ${registryName} (${registryConfig.url})...`);

    const pluginDir = path.join(this.pluginsDir, name);
    if (fs.existsSync(pluginDir)) {
      this.logger.info(`Plugin "${name}" is already installed. Run update to upgrade.`);
      return this._readLock()[name] || null;
    }

    fs.mkdirSync(pluginDir, { recursive: true });

    // Fetch metadata — falls back to a generated stub when offline/unavailable
    const metadata = await this._fetchMetadata(registryConfig.url, name).catch(() => null);

    const manifest = metadata || this._generateStub(name, registryName);
    const mainFile = path.join(pluginDir, manifest.main);

    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(manifest, null, 2) + '\n',
      'utf8'
    );

    if (!fs.existsSync(mainFile)) {
      fs.writeFileSync(
        mainFile,
        this._generatePluginModule(manifest),
        'utf8'
      );
    }

    const lock = this._readLock();
    lock[name] = { specifier, registry: registryName, version: manifest.version, dir: pluginDir };
    this._writeLock(lock);

    this.logger.info(`Installed ${name}@${manifest.version}`);
    return lock[name];
  }

  // ── Uninstall ─────────────────────────────────────────────────────────────

  uninstall(name) {
    const pluginDir = path.join(this.pluginsDir, name);
    if (!fs.existsSync(pluginDir)) {
      throw new Error(`Plugin "${name}" is not installed`);
    }

    if (this._active.has(name)) {
      this.deactivate(name);
    }

    fs.rmSync(pluginDir, { recursive: true, force: true });

    const lock = this._readLock();
    delete lock[name];
    this._writeLock(lock);

    this.logger.info(`Uninstalled ${name}`);
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(name) {
    const lock = this._readLock();
    if (!lock[name]) {
      throw new Error(`Plugin "${name}" is not installed`);
    }
    const { specifier } = lock[name];
    this.uninstall(name);
    return this.install(specifier);
  }

  // ── List ──────────────────────────────────────────────────────────────────

  list() {
    const lock = this._readLock();
    return Object.entries(lock).map(([name, entry]) => ({
      name,
      version: entry.version,
      registry: entry.registry,
      active: this._active.has(name),
    }));
  }

  // ── Activate / Deactivate ─────────────────────────────────────────────────

  activate(name, context = {}) {
    const pluginDir = path.join(this.pluginsDir, name);
    if (!fs.existsSync(pluginDir)) {
      throw new Error(`Plugin "${name}" is not installed`);
    }
    const manifest = activatePlugin(pluginDir, context);
    this._active.set(name, manifest);
    this.logger.info(`Activated plugin: ${name}`);
    return manifest;
  }

  deactivate(name) {
    const pluginDir = path.join(this.pluginsDir, name);
    const manifest = deactivatePlugin(pluginDir);
    this._active.delete(name);
    this.logger.info(`Deactivated plugin: ${name}`);
    return manifest;
  }

  activateAll(context = {}) {
    const lock = this._readLock();
    const results = [];
    for (const name of Object.keys(lock)) {
      try {
        results.push(this.activate(name, context));
      } catch (err) {
        this.logger.error(`Failed to activate "${name}": ${err.message}`);
      }
    }
    return results;
  }

  // ── Sync (reads claude-plugin file) ──────────────────────────────────────

  async sync(claudePluginFile) {
    const filePath = claudePluginFile || path.join(this.baseDir, 'claude-plugin');
    if (!fs.existsSync(filePath)) {
      this.logger.info('No claude-plugin file found — nothing to sync');
      return [];
    }

    const lines = fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));

    const results = [];
    for (const line of lines) {
      const match = line.match(/^\/plugin\s+install\s+(.+)$/);
      if (match) {
        results.push(await this.install(match[1].trim()));
      }
    }
    return results;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async _fetchMetadata(registryUrl, name) {
    const url = buildPluginUrl(registryUrl, name);
    // Use Node 18 native fetch
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`Registry returned ${res.status}`);
    return res.json();
  }

  _generateStub(name, registry) {
    return {
      name,
      version: '1.0.0',
      description: `${name} plugin from ${registry}`,
      main: 'index.js',
      hooks: [],
    };
  }

  _generatePluginModule(manifest) {
    return [
      `'use strict';`,
      ``,
      `// Auto-generated stub for plugin: ${manifest.name}`,
      `function activate(context) {`,
      `  // TODO: implement plugin activation`,
      `}`,
      ``,
      `function deactivate() {`,
      `  // TODO: implement plugin deactivation`,
      `}`,
      ``,
      `module.exports = { activate, deactivate };`,
      ``,
    ].join('\n');
  }
}

module.exports = PluginManager;
