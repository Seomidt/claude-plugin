'use strict';

let _context = null;
let _focusedTopic = null;
let _turnCount = 0;
let _startTime = null;

const COMMANDS = {
  '/superhelp': () => [
    'Superpowers plugin active commands:',
    '  /superhelp         — Show this message',
    '  /think             — Enable extended thinking mode for this turn',
    '  /recap             — Summarize the conversation so far',
    '  /focus <topic>     — Pin a topic for the session',
  ].join('\n'),

  '/think': () => 'Extended thinking mode enabled for this turn.',

  '/recap': () => {
    const elapsed = _startTime ? Math.round((Date.now() - _startTime) / 1000) : 0;
    const lines = [
      'Session recap:',
      `  Turns: ${_turnCount}`,
      `  Duration: ${elapsed}s`,
    ];
    if (_focusedTopic) {
      lines.push(`  Focused topic: ${_focusedTopic}`);
    }
    return lines.join('\n');
  },

  '/focus': (text) => {
    const topic = text.replace(/^\/focus\s*/, '').trim();
    if (!topic) return 'Usage: /focus <topic>';
    _focusedTopic = topic;
    return `Focused on: ${topic}`;
  },
};

function activate(context) {
  _context = context;
  _startTime = Date.now();
  _turnCount = 0;
  _focusedTopic = null;
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
  _focusedTopic = null;
  _startTime = null;
  _turnCount = 0;
}

function onPrompt(promptEvent) {
  if (!promptEvent || !promptEvent.text) return promptEvent;
  _turnCount++;
  const text = promptEvent.text.trim();
  const cmd = text.split(/\s+/)[0];
  if (COMMANDS[cmd]) {
    promptEvent.intercepted = true;
    promptEvent.response = COMMANDS[cmd](text);
  } else if (_focusedTopic) {
    promptEvent.context = promptEvent.context || {};
    promptEvent.context.focusedTopic = _focusedTopic;
  }
  return promptEvent;
}

module.exports = { activate, deactivate, onPrompt };
