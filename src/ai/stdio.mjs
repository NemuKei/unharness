import { Transform } from 'node:stream';
import { parseStrictJson } from '../core/strict-json.mjs';

export const MAX_AI_FRAME_BYTES = 256 * 1024;
export class StrictMcpInput extends Transform {
  pending = Buffer.alloc(0);
  _transform(chunk, _encoding, done) {
    try {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let from = 0;
      while (from < bytes.length) {
        const newline = bytes.indexOf(10, from);
        const end = newline < 0 ? bytes.length : newline;
        const piece = bytes.subarray(from, end);
        if (this.pending.length + piece.length > MAX_AI_FRAME_BYTES) throw Error();
        this.pending = Buffer.concat([this.pending, piece]);
        if (newline < 0) break;
        const text = new TextDecoder('utf-8', { fatal: true }).decode(this.pending);
        parseStrictJson(text);
        this.push(Buffer.concat([this.pending, Buffer.from('\n')]));
        this.pending = Buffer.alloc(0);
        from = newline + 1;
      }
      done();
    } catch { done(Object.assign(new Error('ai-protocol-invalid'), { kind: 'ai-protocol-invalid' })); }
  }
  _flush(done) {
    if (this.pending.length) done(Object.assign(new Error('ai-protocol-invalid'), { kind: 'ai-protocol-invalid' }));
    else done();
  }
}
