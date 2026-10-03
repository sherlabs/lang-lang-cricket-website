import * as migration_20261003_011755_init from './20261003_011755_init';
import * as migration_20261003_023132_wp2_content from './20261003_023132_wp2_content';
import * as migration_20261003_033247_wp2_review_fixes from './20261003_033247_wp2_review_fixes';
import * as migration_20261003_034609_wp3_events from './20261003_034609_wp3_events';
import * as migration_20261003_042619_wp3_review_fixes from './20261003_042619_wp3_review_fixes';
import * as migration_20261003_044835_wp4_stories from './20261003_044835_wp4_stories';
import * as migration_20261003_055903_wp5_players from './20261003_055903_wp5_players';

export const migrations = [
  {
    up: migration_20261003_011755_init.up,
    down: migration_20261003_011755_init.down,
    name: '20261003_011755_init',
  },
  {
    up: migration_20261003_023132_wp2_content.up,
    down: migration_20261003_023132_wp2_content.down,
    name: '20261003_023132_wp2_content',
  },
  {
    up: migration_20261003_033247_wp2_review_fixes.up,
    down: migration_20261003_033247_wp2_review_fixes.down,
    name: '20261003_033247_wp2_review_fixes',
  },
  {
    up: migration_20261003_034609_wp3_events.up,
    down: migration_20261003_034609_wp3_events.down,
    name: '20261003_034609_wp3_events',
  },
  {
    up: migration_20261003_042619_wp3_review_fixes.up,
    down: migration_20261003_042619_wp3_review_fixes.down,
    name: '20261003_042619_wp3_review_fixes',
  },
  {
    up: migration_20261003_044835_wp4_stories.up,
    down: migration_20261003_044835_wp4_stories.down,
    name: '20261003_044835_wp4_stories',
  },
  {
    up: migration_20261003_055903_wp5_players.up,
    down: migration_20261003_055903_wp5_players.down,
    name: '20261003_055903_wp5_players'
  },
];
