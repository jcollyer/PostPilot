import { describe, it, expect } from 'vitest';

import { PublishError, errorFromStatus, quoteBigIntKeys } from './http';

describe('PublishError', () => {
  it('defaults to recoverable when no classification is given', () => {
    const err = new PublishError('boom');
    expect(err.recoverable).toBe(true);
    expect(err.needsReconnect).toBe(false);
    expect(err.rejected).toBe(false);
    expect(err.name).toBe('PublishError');
    expect(err).toBeInstanceOf(Error);
  });

  it('is not recoverable when it needs a reconnect', () => {
    const err = new PublishError('auth dead', { needsReconnect: true });
    expect(err.needsReconnect).toBe(true);
    expect(err.recoverable).toBe(false);
  });

  it('is not recoverable when the content is rejected', () => {
    const err = new PublishError('nope', { rejected: true });
    expect(err.rejected).toBe(true);
    expect(err.recoverable).toBe(false);
  });

  it('honours an explicit recoverable override', () => {
    const err = new PublishError('weird', { rejected: true, recoverable: true });
    expect(err.recoverable).toBe(true);
  });
});

describe('errorFromStatus', () => {
  it('classifies 401/403 as needing reconnect', () => {
    for (const status of [401, 403]) {
      const err = errorFromStatus('upload', status, 'unauthorized');
      expect(err.needsReconnect).toBe(true);
      expect(err.recoverable).toBe(false);
      expect(err.status).toBe(status);
    }
  });

  it('classifies 408/429 and 5xx as recoverable', () => {
    for (const status of [408, 429, 500, 502, 503]) {
      const err = errorFromStatus('upload', status, 'try later');
      expect(err.recoverable).toBe(true);
      expect(err.needsReconnect).toBe(false);
      expect(err.rejected).toBe(false);
    }
  });

  it('classifies other 4xx as rejected (terminal)', () => {
    for (const status of [400, 404, 422]) {
      const err = errorFromStatus('upload', status, 'bad request');
      expect(err.rejected).toBe(true);
      expect(err.recoverable).toBe(false);
    }
  });

  it('includes context, status and a body snippet in the message', () => {
    const err = errorFromStatus('tiktok publish', 400, 'invalid video format');
    expect(err.message).toContain('tiktok publish');
    expect(err.message).toContain('400');
    expect(err.message).toContain('invalid video format');
  });

  it('truncates long bodies to keep messages readable', () => {
    const body = 'x'.repeat(1000);
    const err = errorFromStatus('ctx', 400, body);
    // 400-char snippet + surrounding context, well under the raw 1000.
    expect(err.message.length).toBeLessThan(500);
  });

  it('threads the platform through when provided', () => {
    const err = errorFromStatus('ctx', 500, 'oops', 'YOUTUBE');
    expect(err.platform).toBe('YOUTUBE');
  });
});

describe('quoteBigIntKeys', () => {
  const key = 'publicaly_available_post_id';

  it('keeps every digit of an int64 id that JSON.parse would round', () => {
    const body = `{"data":{"${key}":[7669814400970442766]}}`;
    // Left alone, the id comes back as a number, rounded past the 17th digit.
    const raw = JSON.parse(body).data[key][0];
    expect(typeof raw).toBe('number');
    expect(String(raw)).not.toBe('7669814400970442766');

    const parsed = JSON.parse(quoteBigIntKeys(body, [key]));
    expect(parsed.data[key]).toEqual(['7669814400970442766']);
  });

  it('quotes a scalar value and every member of an array', () => {
    expect(JSON.parse(quoteBigIntKeys(`{"a":123}`, ['a'])).a).toBe('123');
    expect(JSON.parse(quoteBigIntKeys(`{"a":[123, 456]}`, ['a'])).a).toEqual(['123', '456']);
  });

  it('leaves values that are already strings untouched', () => {
    expect(JSON.parse(quoteBigIntKeys(`{"a":["123"]}`, ['a'])).a).toEqual(['123']);
    expect(JSON.parse(quoteBigIntKeys(`{"a":"123"}`, ['a'])).a).toBe('123');
  });

  it('leaves an empty array and a null value valid', () => {
    expect(JSON.parse(quoteBigIntKeys(`{"a":[]}`, ['a'])).a).toEqual([]);
    expect(JSON.parse(quoteBigIntKeys(`{"a":null}`, ['a'])).a).toBeNull();
  });

  it('only touches the declared keys', () => {
    const body = `{"a":123,"b":456}`;
    expect(JSON.parse(quoteBigIntKeys(body, ['a']))).toEqual({ a: '123', b: 456 });
  });

  it('tolerates whitespace around the colon', () => {
    expect(JSON.parse(quoteBigIntKeys(`{"a" : 123}`, ['a'])).a).toBe('123');
  });
});
