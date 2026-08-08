import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from '../../src/server/services/email/queries.js';

describe('cursor codec', () => {
  it('round-trips a sort key through encode/decode', () => {
    const cursor = { primary: 1_754_500_000_000, id: 42 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('produces an opaque base64 string, not directly-parseable JSON', () => {
    const encoded = encodeCursor({ primary: 123, id: 1 });
    expect(() => JSON.parse(encoded)).toThrow();
  });

  it('rejects a corrupt cursor', () => {
    expect(() => decodeCursor('not-a-valid-cursor!!')).toThrow();
  });

  it('rejects valid base64 whose payload is not the expected shape', () => {
    const bogus = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64');
    expect(() => decodeCursor(bogus)).toThrow();
  });

  it('rejects valid base64 that is not JSON at all', () => {
    const notJson = Buffer.from('hello world').toString('base64');
    expect(() => decodeCursor(notJson)).toThrow();
  });
});
