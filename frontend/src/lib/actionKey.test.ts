import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { createActionKeys } from './actionKey';

function keys() {
  let n = 0;
  return createActionKeys(() => `key-${++n}`);
}

describe('createActionKeys', () => {
  it('reuses the key when the same action is retried after a network error', () => {
    const k = keys();
    expect(k.keyFor({ a: 1 })).toBe('key-1');
    k.settle(new ApiError(0, 'NETWORK_ERROR', "The server didn't respond."));
    expect(k.keyFor({ a: 1 })).toBe('key-1');
  });

  it('starts a new action (new key) after a success, so an identical order can be created on purpose', () => {
    const k = keys();
    k.keyFor({ a: 1 });
    k.settle();
    expect(k.keyFor({ a: 1 })).toBe('key-2');
  });

  it('starts a new action after a real answer from the server, even an error', () => {
    const k = keys();
    k.keyFor({ a: 1 });
    k.settle(new ApiError(502, 'PROVIDER_UNAVAILABLE', 'Try later', 'req-1'));
    expect(k.keyFor({ a: 1 })).toBe('key-2');
  });

  it('uses a new key when the data changed, even after a network error', () => {
    const k = keys();
    k.keyFor({ a: 1 });
    k.settle(new ApiError(0, 'NETWORK_ERROR', 'x'));
    expect(k.keyFor({ a: 2 })).toBe('key-2');
  });
});
