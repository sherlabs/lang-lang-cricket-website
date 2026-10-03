import * as migration_20261003_011755_init from './20261003_011755_init';
import * as migration_20261003_023132_wp2_content from './20261003_023132_wp2_content';

export const migrations = [
  {
    up: migration_20261003_011755_init.up,
    down: migration_20261003_011755_init.down,
    name: '20261003_011755_init',
  },
  {
    up: migration_20261003_023132_wp2_content.up,
    down: migration_20261003_023132_wp2_content.down,
    name: '20261003_023132_wp2_content'
  },
];
