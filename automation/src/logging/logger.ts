import { mirrorConsoleToFile } from './consoleMirror';

export interface Logger {
  log(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
}

const COLOR_RESET = '\x1b[0m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_RED = '\x1b[31m';
const COLOR_YELLOW = '\x1b[33m';
const COLOR_CYAN = '\x1b[36m';

function colorize(color: string, message: string): string {
  if (!process.stdout.isTTY) return message;
  return `${color}${message}${COLOR_RESET}`;
}

export function createLogger(options: { logFile: string }): Logger {
  mirrorConsoleToFile(options.logFile);

  return {
    log: (message: string) => {
      console.log(message);
    },
    info: (message: string) => {
      console.log(colorize(COLOR_CYAN, message));
    },
    warn: (message: string) => {
      console.warn(colorize(COLOR_YELLOW, message));
    },
    error: (message: string) => {
      console.error(colorize(COLOR_RED, message));
    },
    success: (message: string) => {
      console.log(colorize(COLOR_GREEN, message));
    },
  };
}
