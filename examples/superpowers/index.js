'use strict';

let _context = null;

const COMMANDS = {
  '/superhelp': () => {
    return [
      'Superpowers plugin active commands:',
      '  /superhelp   — Show this message',
      '  /think       — Enable extended thinking mode',
      '  /recap       — Summarize the conversation so far',
      '  /focus <topic> — Pin a topic for the session',
    ].join('\n');
  },
  '/think': () => 'Extended thinking mode enabled for this turn.',
  '/recap': () => 'Summarizing conversation... (hook into context via plugin context API)',
};

function activate(context) {
  _context = context;
  if (context.registerCommands) {
    context.registerCommands(COMMANDS);
  }
  if (context.log) {
    context.log('superpowers plugin activated');
  }
}

function deactivate() {
  if (_context && _context.unregisterCommands) {
    _context.unregisterCommands(Object.keys(COMMANDS));
  }
  _context = null;
}

/**
 * Hook called before each prompt is sent.
 * Can mutate or augment the prompt object.
 */
function onPrompt(promptEvent) {
  if (!promptEvent || !promptEvent.text) return promptEvent;
  const cmd = promptEvent.text.trim().split(/\s+/)[0];
  if (COMMANDS[cmd]) {
    promptEvent.intercepted = true;
    promptEvent.response = COMMANDS[cmd](promptEvent.text);
  }
  return promptEvent;
}

module.exports = { activate, deactivate, onPrompt };
