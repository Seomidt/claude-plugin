'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, it, beforeEach, afterEach } = require('node:test');

const PLUGIN_PATH = path.resolve(__dirname, '../examples/superpowers');

function freshPlugin() {
  // Clear require cache so module-level state resets between tests
  delete require.cache[require.resolve(PLUGIN_PATH)];
  return require(PLUGIN_PATH);
}

describe('superpowers plugin', () => {
  let plugin;

  beforeEach(() => {
    plugin = freshPlugin();
  });

  afterEach(() => {
    try { plugin.deactivate(); } catch (_) {}
  });

  it('exports activate, deactivate, and onPrompt', () => {
    assert.strictEqual(typeof plugin.activate, 'function');
    assert.strictEqual(typeof plugin.deactivate, 'function');
    assert.strictEqual(typeof plugin.onPrompt, 'function');
  });

  it('activate calls registerCommands and log', () => {
    const registered = [];
    const logs = [];
    plugin.activate({
      registerCommands: (cmds) => registered.push(...Object.keys(cmds)),
      log: (msg) => logs.push(msg),
    });
    assert.ok(registered.includes('/superhelp'));
    assert.ok(registered.includes('/think'));
    assert.ok(registered.includes('/recap'));
    assert.ok(registered.includes('/focus'));
    assert.ok(logs.some(l => l.includes('activated')));
  });

  it('deactivate calls unregisterCommands', () => {
    const unregistered = [];
    plugin.activate({
      registerCommands: () => {},
      unregisterCommands: (keys) => unregistered.push(...keys),
    });
    plugin.deactivate();
    assert.ok(unregistered.includes('/superhelp'));
    assert.ok(unregistered.includes('/focus'));
  });

  it('/superhelp returns help text listing all commands', () => {
    plugin.activate({});
    const event = plugin.onPrompt({ text: '/superhelp' });
    assert.ok(event.intercepted);
    assert.ok(event.response.includes('/focus'));
    assert.ok(event.response.includes('/think'));
    assert.ok(event.response.includes('/recap'));
  });

  it('/think intercepts and returns confirmation', () => {
    plugin.activate({});
    const event = plugin.onPrompt({ text: '/think' });
    assert.ok(event.intercepted);
    assert.ok(event.response.toLowerCase().includes('thinking'));
  });

  it('/focus sets focused topic and returns confirmation', () => {
    plugin.activate({});
    const event = plugin.onPrompt({ text: '/focus performance optimization' });
    assert.ok(event.intercepted);
    assert.ok(event.response.includes('performance optimization'));
  });

  it('/focus without topic returns usage hint', () => {
    plugin.activate({});
    const event = plugin.onPrompt({ text: '/focus' });
    assert.ok(event.intercepted);
    assert.ok(event.response.toLowerCase().includes('usage'));
  });

  it('/focus pins topic onto subsequent non-command prompts', () => {
    plugin.activate({});
    plugin.onPrompt({ text: '/focus security' });
    const event = plugin.onPrompt({ text: 'explain this code' });
    assert.ok(!event.intercepted);
    assert.strictEqual(event.context.focusedTopic, 'security');
  });

  it('/recap shows turn count and focused topic', () => {
    plugin.activate({});
    plugin.onPrompt({ text: 'hello' });
    plugin.onPrompt({ text: '/focus architecture' });
    const event = plugin.onPrompt({ text: '/recap' });
    assert.ok(event.intercepted);
    assert.ok(event.response.includes('Turns:'));
    assert.ok(event.response.includes('architecture'));
  });

  it('onPrompt increments turn count', () => {
    plugin.activate({});
    plugin.onPrompt({ text: 'one' });
    plugin.onPrompt({ text: 'two' });
    const event = plugin.onPrompt({ text: '/recap' });
    assert.ok(event.response.includes('Turns: 3'));
  });

  it('onPrompt returns promptEvent unchanged when no text', () => {
    plugin.activate({});
    const event = plugin.onPrompt({ text: '' });
    assert.ok(!event.intercepted);
  });

  it('onPrompt handles null gracefully', () => {
    plugin.activate({});
    const result = plugin.onPrompt(null);
    assert.strictEqual(result, null);
  });
});

// ── Local install integration ─────────────────────────────────────────────────

const PluginManager = require('../src/plugin-manager');

describe('PluginManager local install', () => {
  let tmpDir;
  let manager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-plugin-local-'));
    manager = new PluginManager({
      baseDir: tmpDir,
      logger: { info: () => {}, warn: () => {}, error: () => {} },
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('installs a plugin from a local file: path', async () => {
    const specifier = `file:${PLUGIN_PATH}`;
    const entry = await manager.install(specifier);
    assert.ok(entry);
    assert.strictEqual(entry.registry, 'local');
    const plugins = manager.list();
    assert.strictEqual(plugins.length, 1);
    assert.strictEqual(plugins[0].name, 'superpowers');
  });

  it('local install copies plugin files', async () => {
    await manager.install(`file:${PLUGIN_PATH}`);
    const installedDir = path.join(tmpDir, 'installed_plugins', 'superpowers');
    assert.ok(fs.existsSync(path.join(installedDir, 'plugin.json')));
    assert.ok(fs.existsSync(path.join(installedDir, 'index.js')));
  });

  it('local install is idempotent', async () => {
    await manager.install(`file:${PLUGIN_PATH}`);
    await manager.install(`file:${PLUGIN_PATH}`);
    assert.strictEqual(manager.list().length, 1);
  });

  it('local install can activate the plugin', async () => {
    await manager.install(`file:${PLUGIN_PATH}`);
    const logs = [];
    const manifest = manager.activate('superpowers', { log: (m) => logs.push(m) });
    assert.strictEqual(manifest.name, 'superpowers');
    assert.ok(logs.some(l => l.includes('activated')));
  });

  it('throws for non-existent local path', async () => {
    await assert.rejects(
      () => manager.install('file:./does-not-exist'),
      /not found/
    );
  });
});

// ── parseSpecifier file: support ─────────────────────────────────────────────

const { parseSpecifier } = require('../src/registry');

describe('parseSpecifier file: support', () => {
  it('parses file: specifier', () => {
    const result = parseSpecifier('file:./examples/superpowers');
    assert.strictEqual(result.name, 'superpowers');
    assert.strictEqual(result.registry, null);
    assert.ok(result.localPath.includes('examples/superpowers'));
  });

  it('file: specifier has no registry', () => {
    const { registry } = parseSpecifier('file:/abs/path/myplugin');
    assert.strictEqual(registry, null);
  });
});
