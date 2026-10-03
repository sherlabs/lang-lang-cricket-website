import * as migration_20261003_011755_init from './20261003_011755_init';

export const migrations = [
  {
    up: migration_20261003_011755_init.up,
    down: migration_20261003_011755_init.down,
    name: '20261003_011755_init'
  },
];
