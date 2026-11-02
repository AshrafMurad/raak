import net from 'node:net';
import type { MalwareScanner } from './private-storage';

/** ClamAV INSTREAM: only an exact engine OK response is CLEAN. Timeout,
 * malformed/unavailable engine and stream-limit failures quarantine. */
export function createClamAvScanner(host: string, port: number): MalwareScanner {
  return (bytes) =>
    new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      let response = '';
      let settled = false;
      const done = (result: 'CLEAN' | 'REJECTED' | 'QUARANTINED') => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(result);
      };
      socket.setTimeout(30_000, () => done('QUARANTINED'));
      socket.on('error', () => done('QUARANTINED'));
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
          const chunk = bytes.subarray(offset, offset + 64 * 1024);
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.length);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4));
      });
      socket.on('data', (chunk: Buffer) => {
        response += chunk.toString('utf8');
        if (response.length > 1024) {
          done('QUARANTINED');
          return;
        }
        const end = response.indexOf('\0');
        if (end !== -1) {
          const result = response.slice(0, end);
          done(
            result === 'stream: OK'
              ? 'CLEAN'
              : /^stream: .+ FOUND$/.test(result)
                ? 'REJECTED'
                : 'QUARANTINED',
          );
        }
      });
      socket.on('close', () => done('QUARANTINED'));
    });
}
