'use strict';

const PluginManager = require('./plugin-manager');

const USAGE = `
Usage: claude-plugin <command> [options]

Commands:
  install <specifier>   Install a plugin (e.g. superpowers@claude-plugins-official)
  uninstall <name>      Remove an installed plugin
  update <name>         Update an installed plugin to the latest version
  list                  List all installed plugins
  activate <name>       Activate a plugin in the current session
  deactivate <name>     Deactivate a running plugin
  sync                  Read the claude-plugin file and install all listed plugins

Options:
  --base-dir <path>     Working directory (default: current directory)
  --help                Show this help message
  --version             Print the CLI version

Examples:
  claude-plugin install superpowers@claude-plugins-official
  claude-plugin list
  claude-plugin sync
`.trimStart();

async function run(argv) {
  const args = argv.slice(2); // strip 'node' and script path

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    process.stdout.write(USAGE);
    process.exitCode = 0;
    return;
  }

  if (args.includes('--version') || args.includes('-v')) {
    const pkg = require('../package.json');
    process.stdout.write(pkg.version + '\n');
    return;
  }

  const baseDirIdx = args.indexOf('--base-dir');
  const baseDir = baseDirIdx !== -1 ? args[baseDirIdx + 1] : process.cwd();

  const manager = new PluginManager({ baseDir });
  const [command, ...rest] = args.filter(a => !a.startsWith('--') && args.indexOf(a) < baseDirIdx || baseDirIdx === -1);

  try {
    switch (command) {
      case 'install': {
        const specifier = rest[0];
        if (!specifier) throw new Error('install requires a plugin specifier, e.g. name@registry');
        await manager.install(specifier);
        break;
      }

      case 'uninstall': {
        const name = rest[0];
        if (!name) throw new Error('uninstall requires a plugin name');
        manager.uninstall(name);
        break;
      }

      case 'update': {
        const name = rest[0];
        if (!name) throw new Error('update requires a plugin name');
        await manager.update(name);
        break;
      }

      case 'list': {
        const plugins = manager.list();
        if (plugins.length === 0) {
          console.log('No plugins installed.');
        } else {
          console.log('Installed plugins:\n');
          for (const p of plugins) {
            const status = p.active ? ' (active)' : '';
            console.log(`  ${p.name}@${p.version}  [${p.registry}]${status}`);
          }
        }
        break;
      }

      case 'activate': {
        const name = rest[0];
        if (!name) throw new Error('activate requires a plugin name');
        manager.activate(name);
        break;
      }

      case 'deactivate': {
        const name = rest[0];
        if (!name) throw new Error('deactivate requires a plugin name');
        manager.deactivate(name);
        break;
      }

      case 'sync': {
        const installed = await manager.sync();
        console.log(`Synced ${installed.length} plugin(s).`);
        break;
      }

      default:
        throw new Error(`Unknown command: "${command}". Run claude-plugin --help for usage.`);
    }
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { run };
