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
import * as migration_20261004_072946_w2_s3_merge_log from './20261004_072946_w2_s3_merge_log';
import * as migration_20261004_073717_w2_s3_labels_names from './20261004_073717_w2_s3_labels_names';
import * as migration_20261004_074421_w2_s3_yearbook_ai from './20261004_074421_w2_s3_yearbook_ai';
import * as migration_20261004_223250_wp_a_selectors from './20261004_223250_wp_a_selectors';
import * as migration_20261005_004135_wp_a_password_chosen from './20261005_004135_wp_a_password_chosen';
import * as migration_20261005_010249_wp_b_availability from './20261005_010249_wp_b_availability';
import * as migration_20261005_021248_wp_c_selection from './20261005_021248_wp_c_selection';
import * as migration_20261005_034438_wp_d_fixture_moved_at from './20261005_034438_wp_d_fixture_moved_at';
import * as migration_20261011_230924_wp_0_innings_period_id from './20261011_230924_wp_0_innings_period_id';
import * as migration_20261011_232622_wp_1_votes from './20261011_232622_wp_1_votes';
import * as migration_20261012_001356_wp_2_nets_card from './20261012_001356_wp_2_nets_card';
import * as migration_20261012_015143_wp_1_social_settings from './20261012_015143_wp_1_social_settings';
import * as migration_20261012_022720_wp_2_social_posts from './20261012_022720_wp_2_social_posts';
import * as migration_20261012_050025_wd_0_social_toss_caption from './20261012_050025_wd_0_social_toss_caption';
import * as migration_20261012_051834_d1_members_office from './20261012_051834_d1_members_office';
import * as migration_20261012_060836_d2_membership_fees from './20261012_060836_d2_membership_fees';
import * as migration_20261012_065830_d2_payment_form_key from './20261012_065830_d2_payment_form_key';
import * as migration_20261012_070911_d3_volunteers from './20261012_070911_d3_volunteers';
import * as migration_20261012_080420_d4_meetings_seats from './20261012_080420_d4_meetings_seats';
import * as migration_20261012_084731_d5_diary_plan from './20261012_084731_d5_diary_plan';
import * as migration_20261012_092416_d5_diary_unique_codes from './20261012_092416_d5_diary_unique_codes';
import * as migration_20261012_093637_d6_email from './20261012_093637_d6_email';
import * as migration_20261012_101638_d7_stock from './20261012_101638_d7_stock';
import * as migration_20261012_114400_d8_form_keys from './20261012_114400_d8_form_keys';
import * as migration_20261012_234856_e1_scouting_settings from './20261012_234856_e1_scouting_settings';
import * as migration_20261013_001154_e1_selection_rules from './20261013_001154_e1_selection_rules';
import * as migration_20261013_023723_signin_broker from './20261013_023723_signin_broker';
import * as migration_20261013_030923_fantasy from './20261013_030923_fantasy';

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
    name: '20261004_071554_w2_s3_import_tags',
  },
  {
    up: migration_20261004_072946_w2_s3_merge_log.up,
    down: migration_20261004_072946_w2_s3_merge_log.down,
    name: '20261004_072946_w2_s3_merge_log',
  },
  {
    up: migration_20261004_073717_w2_s3_labels_names.up,
    down: migration_20261004_073717_w2_s3_labels_names.down,
    name: '20261004_073717_w2_s3_labels_names',
  },
  {
    up: migration_20261004_074421_w2_s3_yearbook_ai.up,
    down: migration_20261004_074421_w2_s3_yearbook_ai.down,
    name: '20261004_074421_w2_s3_yearbook_ai',
  },
  {
    up: migration_20261004_223250_wp_a_selectors.up,
    down: migration_20261004_223250_wp_a_selectors.down,
    name: '20261004_223250_wp_a_selectors',
  },
  {
    up: migration_20261005_004135_wp_a_password_chosen.up,
    down: migration_20261005_004135_wp_a_password_chosen.down,
    name: '20261005_004135_wp_a_password_chosen',
  },
  {
    up: migration_20261005_010249_wp_b_availability.up,
    down: migration_20261005_010249_wp_b_availability.down,
    name: '20261005_010249_wp_b_availability',
  },
  {
    up: migration_20261005_021248_wp_c_selection.up,
    down: migration_20261005_021248_wp_c_selection.down,
    name: '20261005_021248_wp_c_selection',
  },
  {
    up: migration_20261005_034438_wp_d_fixture_moved_at.up,
    down: migration_20261005_034438_wp_d_fixture_moved_at.down,
    name: '20261005_034438_wp_d_fixture_moved_at',
  },
  {
    up: migration_20261011_230924_wp_0_innings_period_id.up,
    down: migration_20261011_230924_wp_0_innings_period_id.down,
    name: '20261011_230924_wp_0_innings_period_id',
  },
  {
    up: migration_20261011_232622_wp_1_votes.up,
    down: migration_20261011_232622_wp_1_votes.down,
    name: '20261011_232622_wp_1_votes',
  },
  {
    up: migration_20261012_001356_wp_2_nets_card.up,
    down: migration_20261012_001356_wp_2_nets_card.down,
    name: '20261012_001356_wp_2_nets_card',
  },
  {
    up: migration_20261012_015143_wp_1_social_settings.up,
    down: migration_20261012_015143_wp_1_social_settings.down,
    name: '20261012_015143_wp_1_social_settings',
  },
  {
    up: migration_20261012_022720_wp_2_social_posts.up,
    down: migration_20261012_022720_wp_2_social_posts.down,
    name: '20261012_022720_wp_2_social_posts',
  },
  {
    up: migration_20261012_050025_wd_0_social_toss_caption.up,
    down: migration_20261012_050025_wd_0_social_toss_caption.down,
    name: '20261012_050025_wd_0_social_toss_caption',
  },
  {
    up: migration_20261012_051834_d1_members_office.up,
    down: migration_20261012_051834_d1_members_office.down,
    name: '20261012_051834_d1_members_office',
  },
  {
    up: migration_20261012_060836_d2_membership_fees.up,
    down: migration_20261012_060836_d2_membership_fees.down,
    name: '20261012_060836_d2_membership_fees',
  },
  {
    up: migration_20261012_065830_d2_payment_form_key.up,
    down: migration_20261012_065830_d2_payment_form_key.down,
    name: '20261012_065830_d2_payment_form_key',
  },
  {
    up: migration_20261012_070911_d3_volunteers.up,
    down: migration_20261012_070911_d3_volunteers.down,
    name: '20261012_070911_d3_volunteers',
  },
  {
    up: migration_20261012_080420_d4_meetings_seats.up,
    down: migration_20261012_080420_d4_meetings_seats.down,
    name: '20261012_080420_d4_meetings_seats',
  },
  {
    up: migration_20261012_084731_d5_diary_plan.up,
    down: migration_20261012_084731_d5_diary_plan.down,
    name: '20261012_084731_d5_diary_plan',
  },
  {
    up: migration_20261012_092416_d5_diary_unique_codes.up,
    down: migration_20261012_092416_d5_diary_unique_codes.down,
    name: '20261012_092416_d5_diary_unique_codes',
  },
  {
    up: migration_20261012_093637_d6_email.up,
    down: migration_20261012_093637_d6_email.down,
    name: '20261012_093637_d6_email',
  },
  {
    up: migration_20261012_101638_d7_stock.up,
    down: migration_20261012_101638_d7_stock.down,
    name: '20261012_101638_d7_stock',
  },
  {
    up: migration_20261012_114400_d8_form_keys.up,
    down: migration_20261012_114400_d8_form_keys.down,
    name: '20261012_114400_d8_form_keys',
  },
  {
    up: migration_20261012_234856_e1_scouting_settings.up,
    down: migration_20261012_234856_e1_scouting_settings.down,
    name: '20261012_234856_e1_scouting_settings',
  },
  {
    up: migration_20261013_001154_e1_selection_rules.up,
    down: migration_20261013_001154_e1_selection_rules.down,
    name: '20261013_001154_e1_selection_rules',
  },
  {
    up: migration_20261013_023723_signin_broker.up,
    down: migration_20261013_023723_signin_broker.down,
    name: '20261013_023723_signin_broker',
  },
  {
    up: migration_20261013_030923_fantasy.up,
    down: migration_20261013_030923_fantasy.down,
    name: '20261013_030923_fantasy'
  },
];
