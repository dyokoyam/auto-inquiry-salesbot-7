import * as fs from 'fs';
import * as path from 'path';

export function mirrorConsoleToFile(targetFile: string): void {
  try {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  } catch {
    // ignore mkdir errors
  }

  const original = {
    log: console.log.bind(console),
    info: console.info ? console.info.bind(console) : console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  } as const;

  const writeLine = (args: any[]): void => {
    const timestamp = new Date().toISOString();
    const line = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
    try {
      fs.appendFileSync(targetFile, `[${timestamp}] ${line}\n`);
    } catch {
      // ignore write errors
    }
  };

  console.log = (...args: any[]) => {
    writeLine(args);
    (original.log as any)(...args);
  };
  console.info = (...args: any[]) => {
    writeLine(args);
    (original.info as any)(...args);
  };
  console.warn = (...args: any[]) => {
    writeLine(args);
    (original.warn as any)(...args);
  };
  console.error = (...args: any[]) => {
    writeLine(args);
    (original.error as any)(...args);
  };
}
