/**
 * The club's social voice (wave C spec 3.3): hashtags, sign-off and caption wording. Seed data only: the `social-settings` global
 * defaults and the code are club-neutral, so a new club replaces this file (or just types its own in Social posts).
 */
export const SOCIAL_DEFAULTS = {
  defaultStyle: 'bold' as const,
  hashtags: ['LangLangCC', 'CommunityCricket', 'GoLangLang'],
  signOff: 'Follow us for more from the club.',
  captionTemplates: {
    result: '{club} {grade} v {opponent}: {score}\n{margin}\nPlayed at {venue}. Thanks to everyone who came down to support.\n{link}',
    fixtures: 'Game day is nearly here! {count} {club} games this weekend.\n{date}\nCome down and cheer them on.\n{link}',
    lineup: 'Our {grade} side for {date} v {opponent}\nPlaying at {venue}. Good luck, everyone!\n{link}',
    potm: '{award}: {player}\n{statline}\nWell played v {opponent}.\n{link}',
    milestone: 'Congratulations {player} on {milestone}! A great effort for {club}.\n{link}',
    statsLeaders: '{metric} leaders for {season}. {leader} is out in front!\n{link}',
    eventPromo: '{event}\n{date} {time}\n{place}\nAll welcome. See you there!\n{link}',
    sponsorThanks: 'A big thank you to {sponsor}, a {tier} sponsor of {club}. We could not do it without you.\n{link}',
    seasonWrap: '{season} wrap-up from {club}: {record}\nThank you to every player, volunteer and supporter.\n{link}',
  },
}
