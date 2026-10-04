import * as migration_20261003_011755_init from './20261003_011755_init';
import * as migration_20261003_023132_wp2_content from './20261003_023132_wp2_content';
import * as migration_20261003_033247_wp2_review_fixes from './20261003_033247_wp2_review_fixes';
import * as migration_20261003_034609_wp3_events from './20261003_034609_wp3_events';
import * as migration_20261003_042619_wp3_review_fixes from './20261003_042619_wp3_review_fixes';
import * as migration_20261003_044835_wp4_stories from './20261003_044835_wp4_stories';
import * as migration_20261003_055903_wp5_players from './20261003_055903_wp5_players';
import * as migration_20261003_064657_wp5_review_fixes from './20261003_064657_wp5_review_fixes';
import * as migration_20261003_101141_dup_shared_legacy_url from './20261003_101141_dup_shared_legacy_url';
import * as migration_20261003_113720_stats_settings from './20261003_113720_stats_settings';
import * as migration_20261003_120047_profile_extras from './20261003_120047_profile_extras';
import * as migration_20261003_123438_yearbooks from './20261003_123438_yearbooks';
import * as migration_20261003_214142_people_sponsors_apparel from './20261003_214142_people_sponsors_apparel';
import * as migration_20261003_223515_people_more_roles from './20261003_223515_people_more_roles';
import * as migration_20261004_031119_theme_global from './20261004_031119_theme_global';
import * as migration_20261004_033909_match_store from './20261004_033909_match_store';
import * as migration_20261004_041815_pages_news from './20261004_041815_pages_news';
import * as migration_20261004_044729_image_block_nullable from './20261004_044729_image_block_nullable';
import * as migration_20261004_054202_w2_s1_stats from './20261004_054202_w2_s1_stats';
import * as migration_20261004_063722_w2_s2_saved_reports from './20261004_063722_w2_s2_saved_reports';
import * as migration_20261004_071554_w2_s3_import_tags from './20261004_071554_w2_s3_import_tags';

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
    name: '20261003_055903_wp5_players',
  },
  {
    up: migration_20261003_064657_wp5_review_fixes.up,
    down: migration_20261003_064657_wp5_review_fixes.down,
    name: '20261003_064657_wp5_review_fixes',
  },
  {
    up: migration_20261003_101141_dup_shared_legacy_url.up,
    down: migration_20261003_101141_dup_shared_legacy_url.down,
    name: '20261003_101141_dup_shared_legacy_url',
  },
  {
    up: migration_20261003_113720_stats_settings.up,
    down: migration_20261003_113720_stats_settings.down,
    name: '20261003_113720_stats_settings',
  },
  {
    up: migration_20261003_120047_profile_extras.up,
    down: migration_20261003_120047_profile_extras.down,
    name: '20261003_120047_profile_extras',
  },
  {
    up: migration_20261003_123438_yearbooks.up,
    down: migration_20261003_123438_yearbooks.down,
    name: '20261003_123438_yearbooks',
  },
  {
    up: migration_20261003_214142_people_sponsors_apparel.up,
    down: migration_20261003_214142_people_sponsors_apparel.down,
    name: '20261003_214142_people_sponsors_apparel',
  },
  {
    up: migration_20261003_223515_people_more_roles.up,
    down: migration_20261003_223515_people_more_roles.down,
    name: '20261003_223515_people_more_roles',
  },
  {
    up: migration_20261004_031119_theme_global.up,
    down: migration_20261004_031119_theme_global.down,
    name: '20261004_031119_theme_global',
  },
  {
    up: migration_20261004_033909_match_store.up,
    down: migration_20261004_033909_match_store.down,
    name: '20261004_033909_match_store',
  },
  {
    up: migration_20261004_041815_pages_news.up,
    down: migration_20261004_041815_pages_news.down,
    name: '20261004_041815_pages_news',
  },
  {
    up: migration_20261004_044729_image_block_nullable.up,
    down: migration_20261004_044729_image_block_nullable.down,
    name: '20261004_044729_image_block_nullable',
  },
  {
    up: migration_20261004_054202_w2_s1_stats.up,
    down: migration_20261004_054202_w2_s1_stats.down,
    name: '20261004_054202_w2_s1_stats',
  },
  {
    up: migration_20261004_063722_w2_s2_saved_reports.up,
    down: migration_20261004_063722_w2_s2_saved_reports.down,
    name: '20261004_063722_w2_s2_saved_reports',
  },
  {
    up: migration_20261004_071554_w2_s3_import_tags.up,
    down: migration_20261004_071554_w2_s3_import_tags.down,
    name: '20261004_071554_w2_s3_import_tags'
  },
];
