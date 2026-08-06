import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPersonFieldsConfig } from '../../src/server/person-fields-config.js';

describe('loadPersonFieldsConfig', () => {
  let dir: string;
  const originalEnv = process.env.PERSON_FIELDS_CONFIG_PATH;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'person-fields-config-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.PERSON_FIELDS_CONFIG_PATH;
    } else {
      process.env.PERSON_FIELDS_CONFIG_PATH = originalEnv;
    }
  });

  function writeConfig(content: string): string {
    const path = join(dir, 'person-fields.json');
    writeFileSync(path, content);
    return path;
  }

  it('loads a valid label array preserving config order', () => {
    const path = writeConfig(JSON.stringify(['Nickname', 'Company']));

    expect(loadPersonFieldsConfig(path)).toEqual(['Nickname', 'Company']);
  });

  it('accepts an empty array (no extra fields)', () => {
    const path = writeConfig(JSON.stringify([]));

    expect(loadPersonFieldsConfig(path)).toEqual([]);
  });

  it('honors the PERSON_FIELDS_CONFIG_PATH override when no path argument is given', () => {
    const path = writeConfig(JSON.stringify(['Nickname']));
    process.env.PERSON_FIELDS_CONFIG_PATH = path;

    expect(loadPersonFieldsConfig()).toEqual(['Nickname']);
  });

  it('rejects a non-array', () => {
    const path = writeConfig(JSON.stringify({ fields: ['Nickname'] }));

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });

  it('rejects an entry that is blank after trimming', () => {
    const path = writeConfig(JSON.stringify(['Nickname', '   ']));

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });

  it('rejects case-insensitive duplicate entries', () => {
    const path = writeConfig(JSON.stringify(['Nickname', 'nickname']));

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });

  it('rejects an entry colliding case-insensitively with a built-in label', () => {
    const path = writeConfig(JSON.stringify(['first name']));

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });

  it.each(['First name', 'Last name', 'Email', 'Phone'])('rejects the built-in label %s regardless of case', (label) => {
    const path = writeConfig(JSON.stringify([label.toUpperCase()]));

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });

  it('fails fast when the file is missing', () => {
    const path = join(dir, 'person-fields.json');

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });

  it('fails fast when the file contains malformed JSON', () => {
    const path = writeConfig('not json');

    expect(() => loadPersonFieldsConfig(path)).toThrow(/person-fields\.json/);
  });
});
