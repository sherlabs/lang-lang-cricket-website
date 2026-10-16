/**
 * Lang Lang Cricket Club's own identity and words (wave F spec 5.2): the preset a Lang Lang deployment selects with
 * `CLUB_PRESET=lang-lang`. Moved verbatim out of the old `club-defaults.ts`; it is the only module that holds this copy.
 * Imported only by `club-defaults.ts`, seeds, scripts and tests (`tests/template-copy.test.ts` enforces it).
 */
import type { ClubDefaults } from '../club-template'

export const LANG_LANG_IDENTITY = {
  name: 'Lang Lang Cricket Club',
  shortName: 'Lang Lang CC',
  familiarName: 'Lang Lang',
  location: 'Caldermeade, Victoria',
  teamNamePrefix: 'Lang Lang',
  associationLabel: 'CCCA Directory',
} as const

const NAME = 'Lang Lang Cricket Club'

export const langLangDefaults: ClubDefaults = {
  // ---- Identity -----------------------------------------------------------
  name: NAME,
  shortName: 'Lang Lang CC',
  tagline: 'Caldermeade, Victoria',
  sport: 'Cricket',
  siteUrl: 'https://langlangcricketclub.com',
  locale: 'en-AU',
  ogLocale: 'en_AU',

  // ---- Contact & location ------------------------------------------------
  email: 'langlangcricketclub@gmail.com',
  sponsorshipSubject: 'Sponsorship enquiry',
  teamsSignOff: '',
  address: { locality: 'Caldermeade', region: 'VIC', regionName: 'Victoria', country: 'AU', countryName: 'Australia' },
  mapQuery: 'Caldermeade, Victoria, Australia',
  associationLabel: 'CCCA Directory',
  honourKeywords: ['ccca'],

  // ---- Socials -----------------------------------------------------------
  // No URL anywhere today: an empty URL renders as text, and only non-empty URLs feed JSON-LD sameAs.
  socials: [{ platform: 'facebook', url: '', label: 'Find us on Facebook' }],

  // ---- SEO ---------------------------------------------------------------
  defaultTitle: NAME,
  titleSuffix: ` | ${NAME}`,
  defaultDescription:
    'Lang Lang Cricket Club — junior and senior cricket in Caldermeade, Victoria. A welcoming community club for beginners through to experienced players.',
  ogImageAlt: 'Lang Lang Cricket Club clubrooms and oval at Caldermeade',
  pages: {
    // Empty: the home page uses defaultTitle / defaultDescription.
    home: { title: '', description: '' },
    sponsors: {
      title: 'Sponsors',
      description: 'The local businesses and supporters who back Lang Lang Cricket Club in Caldermeade, Victoria.',
    },
    gallery: {
      title: 'Gallery',
      description: 'Photos from match days, presentations and club life at Lang Lang Cricket Club in Caldermeade, Victoria.',
    },
    documents: {
      title: 'Documents & Policies',
      description:
        'Codes of conduct, child safety, game day information and policies for members and families of Lang Lang Cricket Club.',
    },
    contact: {
      title: 'Contact',
      description:
        'Get in touch with Lang Lang Cricket Club in Caldermeade, Victoria, for playing, sponsorship and general enquiries.',
    },
    people: {
      title: 'Our People',
      description: 'Meet the coaches, committee and volunteers who keep Lang Lang Cricket Club in Caldermeade, Victoria running.',
    },
    announcements: {
      title: 'Announcements',
      description: 'Latest news and notices from Lang Lang Cricket Club in Caldermeade, Victoria.',
    },
    history: {
      title: 'History',
      description: 'Stories, memories and milestones from the long history of Lang Lang Cricket Club in Caldermeade, Victoria.',
    },
    historySubmit: {
      title: 'Share your story',
      description: 'Share your memories of Lang Lang Cricket Club in Caldermeade and help us preserve our history.',
    },
    events: { title: 'Events', description: 'Upcoming club events, training, and how to RSVP.' },
    players: {
      title: 'Players',
      description:
        'Current and past players of Lang Lang Cricket Club in Caldermeade, Victoria, with career stats and club honours.',
    },
    fixtures: {
      title: 'Fixtures, Results & Teams',
      description: 'Fixtures, results and teams for Lang Lang Cricket Club in Caldermeade, Victoria, across every grade and season.',
    },
    stats: {
      title: 'Stats & Leaderboards',
      description: 'Batting, bowling and fielding leaderboards for Lang Lang Cricket Club in Caldermeade, Victoria, by season and grade.',
    },
    records: {
      title: 'Club Records',
      description: 'Club batting, bowling and fielding records for Lang Lang Cricket Club, across every season on record.',
    },
    honours: {
      title: 'Honour Board',
      description: 'Life members, premiership players, best and fairest winners and other honours at Lang Lang Cricket Club.',
    },
    compare: {
      title: 'Compare Players',
      description: 'Compare two Lang Lang Cricket Club players side by side: batting, bowling and fielding.',
    },
    statlab: {
      title: 'StatLab',
      description: 'Build your own Lang Lang Cricket Club stats table: pick columns, filters and sorting, and export to CSV.',
    },
    yearbooks: {
      title: 'Season Yearbooks',
      description: 'Season-by-season yearbooks for Lang Lang Cricket Club: messages from the club, the stats leaders, results and photos.',
    },
    news: {
      title: 'News',
      description: 'The latest news from Lang Lang Cricket Club in Caldermeade, Victoria: results, announcements and club stories.',
    },
    matches: {
      title: 'Match Archive',
      description: 'Every finished Lang Lang Cricket Club match this season by grade, with results and links to the full scorecards.',
    },
  },

  // ---- History -----------------------------------------------------------
  history: {
    narrative: [
      "Much of the club's written record had faded or gone missing over the decades. In the 2022–23 season that changed: through the work of the Club Committee, the club's history records were restored and brought back into the clubrooms.",
      'Those records now sit alongside a modern home ground in Caldermeade, developed with the support of Cardinia Shire Council and Community Bank Lang Lang, giving the next generation of juniors and seniors a place to add their own chapter.',
    ].join('\n\n'),
    pullQuote: 'You cannot make history without knowing where you started.',
    callout: {
      eyebrow: 'With thanks',
      title: 'The Club Committee',
      body: "For restoring the club's history records in 2022–23.",
    },
  },
  storySubmitIntro:
    'Old photos, scorebooks, match reports, memories from the clubrooms — tell us your Lang Lang story. A committee member reviews every submission before it appears on the site.',

  // ---- Defaults-module only (v1) -------------------------------------------
  assets: {
    logo: '/assets/branding/logo.png',
    // 1200×630, ~125KB: the size link previews expect (WhatsApp drops images over ~300KB).
    ogImage: { url: '/og-image.jpg', width: 1200, height: 630 },
    heroImage: '/assets/branding/hero.jpg',
  },
  familiarName: 'Lang Lang',
  teamNamePrefix: LANG_LANG_IDENTITY.teamNamePrefix,

  home: {
    hero: {
      imageAlt: 'The Lang Lang Cricket Club pavilion and oval at Caldermeade',
      focalY: 60,
      eyebrow: 'Junior & senior cricket in Caldermeade, Victoria',
      headline: 'Play your cricket',
      headlineAccent: 'with Lang Lang',
      intro:
        'A community club with room for every player, from first-time juniors to seasoned seniors, based at a modern home ground in Caldermeade.',
      primaryCta: { label: 'Get in touch' },
      secondaryCta: { label: 'Meet the committee', href: '/contact' },
    },
    highlights: [
      {
        icon: 'user-group',
        title: 'Juniors and seniors',
        body: 'Teams for kids picking up a bat for the first time through to experienced senior cricketers.',
      },
      {
        icon: 'trophy',
        title: 'Everyone gets a game',
        body: 'A friendly, welcoming club where beginners and seasoned players train and play side by side.',
      },
      {
        icon: 'bank',
        title: 'A modern home ground',
        body: 'Our Caldermeade facility was developed with support from Cardinia Shire Council and Community Bank Lang Lang.',
      },
      {
        icon: 'shield-check',
        title: 'Safe for young players',
        body: "We follow Cricket Australia's Safeguarding Children and Young People Framework and a Member Protection Policy.",
      },
    ],
    about: {
      eyebrow: 'About the club',
      title: 'Local cricket, played the right way.',
      intro:
        "Lang Lang Cricket Club fields junior and senior sides out of Caldermeade, in Victoria's south-east. We are a club built by volunteers and families, and we make a point of being welcoming whether you are learning the basics or have played for decades.",
      body: "Our home ground is a modern facility developed with support from Cardinia Shire Council and Bendigo Bank's Community Bank Lang Lang. Off the field, the club is committed to a safe and respectful environment for everyone: we follow Cricket Australia's Safeguarding Children and Young People Framework and a Member Protection Policy that sets clear standards for members, coaches and volunteers.",
      links: [
        { label: 'Our history', href: '/history' },
        { label: 'Policies & documents', href: '/documents' },
      ],
    },
    galleryTeaser: { eyebrow: 'Around the club', title: 'Life at Lang Lang', ctaLabel: 'View the full gallery' },
    committee: {
      eyebrow: 'Committee',
      title: 'The people running the club',
      intro:
        'Volunteers who keep the season ticking over. Reach out to any of them with questions about playing, coaching or helping out.',
      ctaLabel: 'Contact page',
    },
    sponsors: {
      eyebrow: 'Our sponsors',
      title: 'Backed by local businesses',
      intro: 'The club is only possible thanks to the businesses that support us every season.',
      ctaLabel: 'See all sponsors',
    },
    joinCta: {
      eyebrow: 'Join us',
      title: 'Keen to play, coach or volunteer?',
      intro: 'Send the club an email and we will point you to the right person.',
    },
  },

  pageCopy: {
    sponsors: {
      header: {
        eyebrow: 'Sponsors & partners',
        title: 'The businesses behind the club',
        intro:
          'From the pavilion lights to junior kit, our sponsors make the season possible. Please support them where you can.',
      },
      cta: {
        eyebrow: 'Become a sponsor',
        title: 'Put your business in front of the local community.',
        intro: 'Sponsorship packages are available at every tier. Drop the committee a line to find out more.',
        ctaLabel: 'Enquire about sponsorship',
      },
    },
    tierBlurbs: [
      { tier: 'Platinum', blurb: 'Our principal partner.' },
      { tier: 'Gold', blurb: 'Major supporters of the club.' },
      { tier: 'Silver', blurb: 'Backing the club season to season.' },
      { tier: 'Bronze', blurb: 'Local businesses in our corner.' },
      { tier: 'Player', blurb: 'Getting individual players onto the park.' },
    ],
    gallery: {
      header: {
        eyebrow: 'Gallery',
        title: 'Around the club',
        intro: 'Match days, training nights and the people who make Lang Lang what it is. Tap any photo to view it full size.',
      },
      photosLabel: 'Photos',
      ogImageAltSuffix: ' gallery photo',
    },
    documents: {
      header: {
        eyebrow: 'Documents & policies',
        title: 'Club rules, policies and resources',
        intro:
          'Official Cricket Victoria and Cardinia Casey Cricket Association documents that apply to everyone at Lang Lang. All files open as PDFs.',
      },
    },
    documentCategories: [
      {
        category: 'Codes of Conduct',
        icon: 'justice-scale',
        blurb: 'Expected behaviour for players, parents and juniors across the Cardinia Casey Cricket Association.',
      },
      {
        category: 'Policies',
        icon: 'scroll',
        blurb: 'Cricket Victoria and CCCA policies covering weather, social media, screening and complaints.',
      },
      {
        category: 'Child Safety',
        icon: 'shield-check',
        blurb: 'Safeguarding children and young people is a core commitment of the club.',
      },
      { category: 'Game Day', icon: 'clipboard-list', blurb: 'Practical checklists for training and match days.' },
      { category: 'Association directory', icon: 'book-open', blurb: 'Association contacts and club listings for the current season.' },
    ],
    contact: {
      header: {
        eyebrow: 'Contact',
        title: 'Get in touch with the club',
        intro:
          'Questions about joining, junior registrations, coaching or sponsorship? Email the club or contact a committee member directly.',
      },
      committee: {
        eyebrow: 'Committee',
        title: 'Meet the committee',
        intro:
          'The volunteers who run the club. Our Child Safety Officer is your first point of contact for any safeguarding concern.',
      },
      leadership: {
        eyebrow: 'Senior leadership team',
        title: 'Leading our senior program',
        intro: 'The group responsible for selection, coaching and the direction of our senior sides.',
      },
      findUs: {
        eyebrow: 'Find us',
        intro:
          'Our modern home ground in Caldermeade was developed with support from Cardinia Shire Council and Community Bank Lang Lang.',
      },
    },
    contactCards: {
      emailLabel: 'Email',
      homeGroundLabel: 'Home ground',
      socialLabel: 'Social',
      socialNote: 'Match schedules, results and club news.',
    },
    safeguardingNote: {
      text: "Lang Lang Cricket Club follows Cricket Australia's Safeguarding Children and Young People Framework and a Member Protection Policy. Our policies and codes of conduct are available on the",
      linkLabel: 'Documents & Policies',
      linkHref: '/documents',
      after: 'page.',
    },
    people: {
      header: {
        eyebrow: 'Clubhouse',
        title: 'Our People',
        intro:
          'Lang Lang is run by volunteers: the committee, the senior leadership team and the coaches who give their weekends to our juniors. Here is who they are and how to reach them.',
      },
    },
    peopleSections: [
      {
        key: 'leadership',
        label: 'Senior Leadership Team',
        heading: 'Leading our senior program',
        intro: 'The group responsible for selection, coaching and the direction of our senior sides.',
      },
      {
        key: 'committee',
        label: 'Committee',
        heading: 'Meet the committee',
        intro:
          'The volunteers who keep the club running, on and off the field. Our Child Safety Officer is your first point of contact for any safeguarding concern.',
      },
      {
        key: 'coach',
        label: 'Junior Coaches',
        heading: 'Coaching our juniors',
        intro:
          'The coaches who look after our junior squads each week, from first-time players through to the older age groups.',
      },
    ],
    announcements: {
      header: {
        eyebrow: 'Clubhouse',
        title: 'Announcements',
        intro:
          'Club notices, in one place — training changes, working bees, presentation nights and anything else the committee needs you to know.',
      },
    },
    history: {
      header: {
        eyebrow: 'Our history',
        title: 'Where the club comes from',
        intro:
          'A community cricket club is the sum of the people who have pulled on the colours over the years. Here is how we are piecing that story back together.',
      },
      image: '/assets/gallery/photo-01.jpg',
      imageAlt: 'Lang Lang Cricket Club players on the field at Caldermeade',
    },
    fixtures: {
      intro: 'The next round, the latest results and every Lang Lang side — straight from PlayHQ.',
      noTeams: 'No Lang Lang sides have been entered for this season yet.',
    },
    news: {
      title: 'News',
      empty: 'No news yet. Check back soon.',
      notFoundTitle: 'News not found',
      pageNotFoundTitle: 'Page not found',
      strip: { eyebrow: 'Club news', title: 'Latest news', ctaLabel: 'All news' },
    },
    events: {
      header: {
        eyebrow: 'Events',
        title: "What's on at the club",
        intro:
          "Training nights, presentation dinners, fundraisers and family days. Let us know you're coming so we can plan the numbers.",
      },
    },
    rsvp: {
      eyebrow: 'RSVP',
      introYes: 'Let us know you’re coming so we can plan the numbers. It only takes a moment.',
      introNo: "Sorry you can't make it — let us know so we can plan the numbers.",
    },
    rsvpEdit: {
      header: {
        eyebrow: 'Your RSVP',
        title: 'Manage your RSVP',
        intro:
          'Plans changed? Switch your answer, update your details, or take yourself off the list. Changes save straight away.',
      },
    },
    players: {
      header: {
        eyebrow: 'The club',
        title: 'Players',
        intro:
          'Everyone who has pulled on the colours for our senior teams — current squads and the players who came before them.',
      },
      empty: 'Player records are on their way.',
      milestones: { heading: 'Milestones' },
    },
    stats: {
      header: {
        eyebrow: 'The numbers',
        title: 'Stats & leaderboards',
        intro: 'Who has scored the most, taken the most wickets and held the most catches for our senior teams.',
      },
      empty: 'No stats match these filters yet.',
      notEnoughHeading: 'Not enough data yet',
      notEnoughNote: 'These players have a result but fall below the minimum, so they are not ranked.',
    },
    records: {
      header: {
        eyebrow: 'The record books',
        title: 'Club records',
        intro: 'The best individual performances on record for our senior teams, across seasons and in a single season.',
      },
      empty: 'No records are available yet.',
    },
    honours: {
      header: {
        eyebrow: 'The honour board',
        title: 'Honours',
        intro: 'Life members, premiership players, award winners and office-holders, as recorded on each player page.',
      },
      empty: 'No honours have been recorded yet.',
      byHonourLabel: 'By honour',
      byYearLabel: 'By year',
    },
    compare: {
      header: {
        eyebrow: 'Head to head',
        title: 'Compare players',
        intro: 'Pick two players to set their batting, bowling and fielding side by side. Copy the link to share the comparison.',
      },
      empty: 'Choose two players to compare.',
      unknownPlayer: 'We could not find that player. Pick someone from the list.',
      sameLabel: 'Pick two different players.',
    },
    statlab: {
      header: {
        eyebrow: 'Build your own',
        title: 'StatLab',
        intro: 'Pick the stats, filter the players and sort the table. Copy the link to save a report, or download it as a spreadsheet.',
      },
      empty: 'No players match these filters.',
      presetsHeading: 'Quick reports',
      coverageNote: 'Figures cover seasons from the first season on record in the database; earlier history is not included.',
    },
    yearbooks: {
      header: {
        eyebrow: 'Season by season',
        title: 'Yearbooks',
        intro: 'One page for each season: messages from the club, the stats leaders, the results and the photos.',
      },
      empty: 'No yearbooks have been published yet.',
      printLabel: 'Print or save as PDF',
      statsHeading: 'The numbers',
      aiNote: 'Written with AI assistance',
    },
    matches: {
      header: {
        eyebrow: 'Match archive',
        title: 'Past matches',
        intro: 'Every finished match by season and grade. Open a match for the full scorecard.',
      },
      empty: 'No finished matches match these filters.',
      coverageNote: 'Only seasons listed on PlayHQ are available here; earlier matches are not in the archive.',
      narrowHint: 'This season has a lot of matches, so only the latest rounds are shown. Choose a grade to see them all.',
    },
    storyDraftEdit: {
      header: {
        eyebrow: 'Your story',
        title: 'Edit your story',
        intro: 'Changes save straight back to your submission.',
      },
    },
    emptyStates: {
      sponsors: 'Sponsor details will be published soon.',
      documents: 'Documents will be published soon.',
      announcements: 'Nothing to announce right now — check back soon.',
    },
  },

  navigation: {
    // What a visitor comes to the site for most weeks: always visible on desktop.
    primaryNav: [
      { href: '/fixtures', label: 'Fixtures' },
      { href: '/events', label: 'Events' },
      { href: '/players', label: 'Players' },
      { href: '/stats', label: 'Stats' },
      { href: '/history', label: 'History' },
    ],
    // Around the clubrooms: grouped under a "Clubhouse" disclosure on desktop.
    clubhouseLabel: 'Clubhouse',
    clubhouseNav: [
      { href: '/people', label: 'Our People' },
      { href: '/announcements', label: 'Announcements' },
      { href: '/gallery', label: 'Gallery' },
      { href: '/sponsors', label: 'Sponsors' },
      { href: '/documents', label: 'Documents' },
    ],
    navCta: { label: 'Get in touch', href: '/contact' },
    newsLabel: 'News',
    // Column 1 mirrors the main nav + Contact, column 2 the Clubhouse group — five links each.
    footerNav: {
      heading: 'Explore',
      columns: [
        [
          { href: '/fixtures', label: 'Fixtures' },
          { href: '/events', label: 'Events' },
          { href: '/players', label: 'Players' },
          { href: '/stats', label: 'Stats' },
          { href: '/records', label: 'Records' },
          { href: '/honours', label: 'Honours' },
          { href: '/statlab', label: 'StatLab' },
          { href: '/players/compare', label: 'Compare players' },
          { href: '/yearbooks', label: 'Yearbooks' },
          { href: '/history', label: 'History' },
          { href: '/contact', label: 'Contact' },
        ],
        [
          { href: '/people', label: 'Our People' },
          { href: '/announcements', label: 'Announcements' },
          { href: '/gallery', label: 'Gallery' },
          { href: '/sponsors', label: 'Sponsors' },
          { href: '/documents', label: 'Documents' },
        ],
      ],
    },
    findUsHeading: 'Find us',
    footerSocialSuffix: ' for club news',
    footerBlurb:
      'Junior and senior cricket in Caldermeade, Victoria. New to the game or a seasoned player, there is a spot for you on the field.',
    fundingCredit: 'Proudly supported by Cardinia Shire Council and Community Bank Lang Lang.',
    copyrightName: NAME,
  },
}
