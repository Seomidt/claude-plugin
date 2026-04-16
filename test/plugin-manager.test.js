'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, before, after, beforeEach } = require('node:test');

const PluginManager = require('../src/plugin-manager');
const { parseSpecifier, resolveRegistry, buildPluginUrl, BUILTIN_REGISTRIES } = require('../src/registry');
const { readManifest } = require('../src/plugin-loader');

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'claude-plugin-test-'));
}

function makePlugin(dir, name, overrides = {}) {
  const pluginDir = path.join(dir, 'installed_plugins', name);
  fs.mkdirSync(pluginDir, { recursive: true });
  const manifest = {
    name,
    version: '1.0.0',
    description: `Test plugin ${name}`,
    main: 'index.js',
    ...overrides,
  };
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(
    path.join(pluginDir, 'index.js'),
    `'use strict';\nfunction activate(ctx) {}\nfunction deactivate() {}\nmodule.exports = { activate, deactivate };\n`
  );
  return pluginDir;
}

// ── Registry tests ────────────────────────────────────────────────────────────

describe('parseSpecifier', () => {
  it('returns default registry when no @ present', () => {
    const result = parseSpecifier('superpowers');
    assert.strictEqual(result.name, 'superpowers');
    assert.strictEqual(result.registry, 'claude-plugins-official');
  });

  it('parses name and registry correctly', () => {
    const result = parseSpecifier('superpowers@claude-plugins-official');
    assert.strictEqual(result.name, 'superpowers');
    assert.strictEqual(result.registry, 'claude-plugins-official');
  });

  it('handles names containing @', () => {
    const result = parseSpecifier('@scope/plugin@my-registry');
    assert.strictEqual(result.name, '@scope/plugin');
    assert.strictEqual(result.registry, 'my-registry');
  });
});

describe('resolveRegistry', () => {
  it('resolves a builtin registry', () => {
    const reg = resolveRegistry('claude-plugins-official');
    assert.ok(reg.url);
  });

  it('resolves a custom registry', () => {
    const custom = { 'my-reg': { url: 'https://example.com', description: 'test' } };
    const reg = resolveRegistry('my-reg', custom);
    assert.strictEqual(reg.url, 'https://example.com');
  });

  it('throws for unknown registry', () => {
    assert.throws(() => resolveRegistry('unknown-registry'), /Unknown registry/);
  });
});

describe('buildPluginUrl', () => {
  it('builds correct URL', () => {
    const url = buildPluginUrl('https://plugins.claude.ai/registry', 'superpowers');
    assert.strictEqual(url, 'https://plugins.claude.ai/registry/plugins/superpowers');
  });

  it('strips trailing slash', () => {
    const url = buildPluginUrl('https://plugins.claude.ai/registry/', 'foo');
    assert.strictEqual(url, 'https://plugins.claude.ai/registry/plugins/foo');
  });
});

// ── Plugin loader tests ───────────────────────────────────────────────────────

describe('readManifest', () => {
  let tmpDir;
  before(() => { tmpDir = makeTempDir(); });
  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('reads a valid manifest', () => {
    makePlugin(tmpDir, 'alpha');
    const manifest = readManifest(path.join(tmpDir, 'installed_plugins', 'alpha'));
    assert.strictEqual(manifest.name, 'alpha');
    assert.strictEqual(manifest.version, '1.0.0');
  });

  it('throws when plugin.json is missing', () => {
    const empty = path.join(tmpDir, 'empty-plugin');
    fs.mkdirSync(empty, { recursive: true });
    assert.throws(() => readManifest(empty), /Missing plugin\.json/);
  });

  it('throws when required field is missing', () => {
    const dir = path.join(tmpDir, 'bad-plugin');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({ name: 'bad' }));
    assert.throws(() => readManifest(dir), /missing required field/);
  });
});

// ── PluginManager tests ───────────────────────────────────────────────────────

describe('PluginManager', () => {
  let tmpDir;
  let manager;

  beforeEach(() => {
    tmpDir = makeTempDir();
    manager = new PluginManager({ baseDir: tmpDir, logger: { info: () => {}, warn: () => {}, error: () => {} } });
  });

  after(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('lists empty when no plugins installed', () => {
    assert.deepStrictEqual(manager.list(), []);
  });

  it('install creates plugin directory and lock entry', async () => {
    await manager.install('testplugin@claude-plugins-official');
    const plugins = manager.list();
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].name, 'testplugin');
    assert.strictEqual(plugins[0].registry, 'claude-plugins-official');
  });

  it('install is idempotent', async () => {
    await manager.install('testplugin@claude-plugins-official');
    await manager.install('testplugin@claude-plugins-official');
    assert.strictEqual(manager.list().length, 1);
  });

  it('uninstall removes plugin and lock entry', async () => {
    await manager.install('testplugin@claude-plugins-official');
    manager.uninstall('testplugin');
    assert.deepStrictEqual(manager.list(), []);
  });

  it('uninstall throws for unknown plugin', () => {
    assert.throws(() => manager.uninstall('ghost'), /not installed/);
  });

  it('activate and deactivate track active state', async () => {
    makePlugin(tmpDir, 'myplugin');
    const lock = {};
    lock['myplugin'] = { specifier: 'myplugin@claude-plugins-official', registry: 'claude-plugins-official', version: '1.0.0', dir: path.join(tmpDir, 'installed_plugins', 'myplugin') };
    fs.writeFileSync(path.join(tmpDir, 'claude-plugin.lock'), JSON.stringify(lock, null, 2));

    manager.activate('myplugin');
    assert.strictEqual(manager.list()[0].active, true);

    manager.deactivate('myplugin');
    assert.strictEqual(manager.list()[0].active, false);
  });

  it('sync reads claude-plugin file and installs listed plugins', async () => {
    const claudePluginFile = path.join(tmpDir, 'claude-plugin');
    fs.writeFileSync(claudePluginFile, [
      '# my plugins',
      '/plugin install alpha@claude-plugins-official',
      '/plugin install beta@claude-plugins-official',
    ].join('\n'));

    await manager.sync(claudePluginFile);
    const names = manager.list().map(p => p.name).sort();
    assert.deepStrictEqual(names, ['alpha', 'beta']);
  });

  it('sync ignores comments and blank lines', async () => {
    const claudePluginFile = path.join(tmpDir, 'claude-plugin');
    fs.writeFileSync(claudePluginFile, '\n# comment\n\n/plugin install gamma@claude-plugins-official\n');
    await manager.sync(claudePluginFile);
    assert.strictEqual(manager.list().length, 1);
  });
});
