// ── apiKeyService unit tests ──

const svc = require('../../src/services/apiKeyService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.del.mockReset().mockResolvedValue(1);
  c.delete.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.whereNull.mockReset().mockReturnValue(c);
  c.select.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
  c.leftJoin.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
});

// ── hashKey ───────────────────────────────────────────────────────────────────
describe('apiKeyService.hashKey', () => {
  it('should return a 64-character hex string', () => {
    const hash = svc.hashKey('cdc_test_raw_key');
    expect(typeof hash).toBe('string');
    expect(hash).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('should produce the same hash for the same input', () => {
    const h1 = svc.hashKey('same_input');
    const h2 = svc.hashKey('same_input');
    expect(h1).toBe(h2);
  });

  it('should produce different hashes for different inputs', () => {
    const h1 = svc.hashKey('input_a');
    const h2 = svc.hashKey('input_b');
    expect(h1).not.toBe(h2);
  });
});

// ── createKey ─────────────────────────────────────────────────────────────────
describe('apiKeyService.createKey', () => {
  it('should throw when name is empty', async () => {
    await expect(svc.createKey({ name: '', createdBy: 1 })).rejects.toThrow('name is required');
  });

  it('should throw when name is whitespace only', async () => {
    await expect(svc.createKey({ name: '   ', createdBy: 1 })).rejects.toThrow('name is required');
  });

  it('should insert the key and return the row with the one-time raw secret', async () => {
    db.__chain.insert.mockResolvedValueOnce([10]);
    db.__chain.first.mockResolvedValueOnce({
      id: 10, name: 'CI Token', key_prefix: 'cdc_abc12',
      created_at: new Date(), scopes: null,
    });

    const result = await svc.createKey({ name: 'CI Token', createdBy: 1 });
    expect(result.id).toBe(10);
    expect(typeof result.raw).toBe('string');
    expect(result.raw.startsWith('cdc_')).toBe(true);
    expect(db.__chain.insert).toHaveBeenCalledTimes(1);
  });

  it('should store scopes as JSON string when provided', async () => {
    db.__chain.insert.mockResolvedValueOnce([11]);
    db.__chain.first.mockResolvedValueOnce({
      id: 11, name: 'Read Token', key_prefix: 'cdc_xyz',
      created_at: new Date(), scopes: '["read:indicators"]',
    });

    await svc.createKey({ name: 'Read Token', scopes: ['read:indicators'], createdBy: 2 });
    const insertCall = db.__chain.insert.mock.calls[0][0];
    expect(JSON.parse(insertCall.scopes)).toEqual(['read:indicators']);
  });

  it('should set note to null when not provided', async () => {
    db.__chain.insert.mockResolvedValueOnce([12]);
    db.__chain.first.mockResolvedValueOnce({ id: 12, name: 'Plain', scopes: null, key_prefix: 'cdc_p' });

    await svc.createKey({ name: 'Plain', createdBy: 3 });
    const insertCall = db.__chain.insert.mock.calls[0][0];
    expect(insertCall.note).toBeNull();
  });
});

// ── verifyKey ─────────────────────────────────────────────────────────────────
describe('apiKeyService.verifyKey', () => {
  it('should return null for null input', async () => {
    const result = await svc.verifyKey(null);
    expect(result).toBeNull();
  });

  it('should return null for non-string input', async () => {
    const result = await svc.verifyKey(12345);
    expect(result).toBeNull();
  });

  it('should return null when the key is not found in DB', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    const result = await svc.verifyKey('cdc_doesnotexist');
    expect(result).toBeNull();
  });

  it('should return null when the key is revoked', async () => {
    db.__chain.first.mockResolvedValueOnce({
      id: 5, key_hash: 'xxx', revoked_at: new Date(), scopes: null, created_by: 1,
    });
    const result = await svc.verifyKey('cdc_revoked_key_value');
    expect(result).toBeNull();
  });

  it('should return key metadata on a valid non-revoked key', async () => {
    const raw = 'cdc_test_valid_key_12345678';
    const hash = svc.hashKey(raw);
    db.__chain.first.mockResolvedValueOnce({
      id: 7, key_hash: hash, revoked_at: null, scopes: null, created_by: 1,
    });
    const result = await svc.verifyKey(raw);
    expect(result).toMatchObject({ id: 7, created_by: 1 });
    expect(result.scopes).toBeNull();
  });

  it('should parse JSON scopes on a valid key', async () => {
    const raw = 'cdc_test_scoped_key_9876';
    const hash = svc.hashKey(raw);
    db.__chain.first.mockResolvedValueOnce({
      id: 8, key_hash: hash, revoked_at: null,
      scopes: '["read:indicators","write:reports"]', created_by: 2,
    });
    const result = await svc.verifyKey(raw);
    expect(result.scopes).toEqual(['read:indicators', 'write:reports']);
  });
});

// ── listKeys ──────────────────────────────────────────────────────────────────
describe('apiKeyService.listKeys', () => {
  it('should return all keys with parsed scopes', async () => {
    const row = { id: 1, name: 'CI', key_prefix: 'cdc_ci', scopes: '["read"]', revoked_at: null };
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([row]).then(r));
    const result = await svc.listKeys();
    expect(result).toHaveLength(1);
    expect(result[0].scopes).toEqual(['read']);
  });

  it('should return null scopes for keys with no scopes', async () => {
    const row = { id: 2, name: 'Anon', key_prefix: 'cdc_an', scopes: null };
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([row]).then(r));
    const result = await svc.listKeys();
    expect(result[0].scopes).toBeNull();
  });
});

// ── revokeKey ─────────────────────────────────────────────────────────────────
describe('apiKeyService.revokeKey', () => {
  it('should call update with revoked_at', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    await svc.revokeKey(5);
    expect(db.__chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ revoked_at: expect.anything() })
    );
  });
});

// ── updateKey ─────────────────────────────────────────────────────────────────
describe('apiKeyService.updateKey', () => {
  it('should return the existing row without updating when no fields are provided', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 5, name: 'CI', scopes: null });
    const result = await svc.updateKey(5, {});
    expect(result).toMatchObject({ id: 5 });
    expect(db.__chain.update).not.toHaveBeenCalled();
  });

  it('should update name and return the fresh row', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 5, name: 'New Name', scopes: null });
    const result = await svc.updateKey(5, { name: 'New Name' });
    expect(result).toMatchObject({ id: 5, name: 'New Name' });
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
  });

  it('should set scopes to null when empty array is provided', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 5, name: 'CI', scopes: null });
    await svc.updateKey(5, { scopes: [] });
    const updateCall = db.__chain.update.mock.calls[0][0];
    expect(updateCall.scopes).toBeNull();
  });

  it('should store scopes as JSON string for a non-empty array', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 5, name: 'CI', scopes: '["write:all"]' });
    await svc.updateKey(5, { scopes: ['write:all'] });
    const updateCall = db.__chain.update.mock.calls[0][0];
    expect(JSON.parse(updateCall.scopes)).toEqual(['write:all']);
  });

  it('should set note to null when empty string is provided', async () => {
    db.__chain.update.mockResolvedValueOnce(1);
    db.__chain.first.mockResolvedValueOnce({ id: 5, name: 'CI', scopes: null });
    await svc.updateKey(5, { note: '' });
    const updateCall = db.__chain.update.mock.calls[0][0];
    expect(updateCall.note).toBeNull();
  });
});
