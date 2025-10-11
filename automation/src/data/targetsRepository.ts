import * as fs from 'fs';
import csv from 'csv-parser';
import type { Target } from '../types/target';

function createCsvStream(filePath: string) {
  return fs.createReadStream(filePath).pipe(csv());
}

export async function countTargets(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const stream: any = createCsvStream(filePath);
    stream
      .on('data', () => {
        count += 1;
      })
      .on('end', () => resolve(count))
      .on('error', (error: Error) => reject(error));
  });
}

export async function loadTargetsChunk(filePath: string, offset: number, limit: number): Promise<Target[]> {
  return new Promise((resolve, reject) => {
    if (offset < 0) offset = 0;
    if (limit <= 0) {
      resolve([]);
      return;
    }

    const picked: Target[] = [];
    let index = 0;
    let done = false;
    const stream: any = createCsvStream(filePath);

    const closeStream = () => {
      try {
        stream.removeAllListeners();
        stream.destroy();
      } catch {
        // ignore
      }
    };

    stream.on('data', (row: Target) => {
      if (done) return;
      if (index >= offset && picked.length < limit) {
        picked.push(row);
        if (picked.length >= limit) {
          done = true;
          closeStream();
          resolve(picked);
          return;
        }
      }
      index += 1;
    });

    stream.on('end', () => {
      if (!done) {
        done = true;
        resolve(picked);
      }
    });

    stream.on('error', (error: Error) => {
      if (!done) {
        done = true;
        reject(error);
      }
    });
  });
}

export async function loadAllTargets(filePath: string): Promise<Target[]> {
  return new Promise((resolve, reject) => {
    const results: Target[] = [];
    const stream: any = createCsvStream(filePath);
    stream
      .on('data', (row: Target) => results.push(row))
      .on('end', () => resolve(results))
      .on('error', (error: Error) => reject(error));
  });
}
