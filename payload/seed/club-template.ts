/**
 * The shape of a club's identity and copy (spec §4.1, D9) and `buildClubDefaults`, the pure builder that writes
 * neutral copy for any club. `payload/seed/club-defaults.ts` picks the active set (a preset or the neutral template);
 * `payload/seed/presets/lang-lang.ts` holds Lang Lang's own words. Consumers of the active set:
 * - the `club` global's field defaults (payload/globals/Club.ts);
 * - `seed-club.ts` and the bootstrap script (write the global part of this object);
 * - `getClub()` (lib/club.ts), which merges the saved global over these values.
 *
 * `ClubGlobalDefaults` mirrors the admin-editable `club` global. The other groups
 * (`home`, `pageCopy`, `navigation`) are defaults-module only in v1: typed and returned by
 * `getClub()`, but not editable in the admin. Promoting them to global tabs later is additive.
 *
 * Pure data: no Payload, React or Next imports (the frontend and the admin both import it).
 */

/** Default wording of the merchandise button (the link itself has no default: the committee supplies it). */
export const DEFAULT_APPAREL_LABEL = 'Club apparel'

export const SOCIAL_PLATFORMS = ['facebook', 'instagram', 'x', 'youtube', 'tiktok'] as const
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number]

/** Hugeicons whitelist for the highlight and document-category icons (mapped in lib/club-icons.ts). */
export const CLUB_ICONS = [
  'user-group',
  'trophy',
  'bank',
  'shield-check',
  'justice-scale',
  'scroll',
  'clipboard-list',
  'book-open',
  'file-text',
] as const
export type ClubIcon = (typeof CLUB_ICONS)[number]

/** Pages with their own `<title>`/description in the SEO tab. */
export const SEO_PAGES = [
  'home',
  'sponsors',
  'gallery',
  'documents',
  'contact',
  'people',
  'announcements',
  'history',
  'historySubmit',
  'events',
  'players',
  'fixtures',
  'stats',
  'records',
  'honours',
  'compare',
  'statlab',
  'yearbooks',
  'matches',
  'news',
] as const
export type SeoPage = (typeof SEO_PAGES)[number]

export type PageSeo = { title: string; description: string }
export type Link = { label: string; href: string }
export type SectionCopy = { eyebrow: string; title: string; intro: string }
export type HeaderCopy = { eyebrow: string; title: string; intro: string }

/** The admin-editable part (the `club` global). Upload fields are ids/URLs resolved by getClub(). */
export type ClubGlobalDefaults = {
  // Identity
  name: string
  shortName: string
  tagline: string
  sport: string
  siteUrl: string
  locale: string
  ogLocale: string
  // Contact & location
  email: string
  sponsorshipSubject: string
  /** Last line of a team announcement post (e.g. a club cheer). Empty by default, so a club that sets nothing shows nothing. */
  teamsSignOff: string
  address: { locality: string; region: string; regionName: string; country: string; countryName: string }
  mapQuery: string
  /** Visible label of the "Association directory" document section (the stored category value never changes). */
  associationLabel: string
  /** Extra keywords that mark an honour as an association honour (for example a local association's short name). */
  honourKeywords: string[]
  // Socials
  socials: { platform: SocialPlatform; url: string; label: string }[]
  // SEO
  defaultTitle: string
  titleSuffix: string
  defaultDescription: string
  ogImageAlt: string
  pages: Record<SeoPage, PageSeo>
  // History
  history: {
    /** Paragraphs separated by a blank line. */
    narrative: string
    pullQuote: string
    callout: { eyebrow: string; title: string; body: string }
  }
  storySubmitIntro: string
}

export type ClubDefaults = ClubGlobalDefaults & {
  /** Static fallbacks for the upload fields (`logo`, `ogImage`) and the home hero. */
  assets: {
    logo: string
    ogImage: { url: string; width: number; height: number }
    heroImage: string
  }
  /** How the club refers to itself in running copy ("Life at Lang Lang"). */
  familiarName: string
  /** Stripped from PlayHQ team names for display ("Lang Lang B Grade" → "B Grade"). */
  teamNamePrefix: string
  home: {
    hero: {
      imageAlt: string
      /** CSS object-position Y, percent. */
      focalY: number
      eyebrow: string
      headline: string
      headlineAccent: string
      intro: string
      /** Opens an email to the club address. */
      primaryCta: { label: string }
      secondaryCta: Link
    }
    highlights: { icon: ClubIcon; title: string; body: string }[]
    about: SectionCopy & { body: string; links: Link[] }
    galleryTeaser: { eyebrow: string; title: string; ctaLabel: string }
    committee: SectionCopy & { ctaLabel: string }
    sponsors: SectionCopy & { ctaLabel: string }
    joinCta: SectionCopy
  }
  pageCopy: {
    sponsors: {
      header: HeaderCopy
      cta: SectionCopy & { ctaLabel: string }
    }
    tierBlurbs: { tier: string; blurb: string }[]
    gallery: { header: HeaderCopy; photosLabel: string; ogImageAltSuffix: string }
    documents: { header: HeaderCopy }
    documentCategories: { category: string; icon: ClubIcon; blurb: string }[]
    contact: {
      header: HeaderCopy
      committee: SectionCopy
      leadership: SectionCopy
      findUs: { eyebrow: string; intro: string }
    }
    contactCards: { emailLabel: string; homeGroundLabel: string; socialLabel: string; socialNote: string }
    safeguardingNote: { text: string; linkLabel: string; linkHref: string; after: string }
    people: { header: HeaderCopy }
    peopleSections: { key: 'leadership' | 'committee' | 'coach'; label: string; heading: string; intro: string }[]
    announcements: { header: HeaderCopy }
    history: { header: HeaderCopy; image: string; imageAlt: string }
    fixtures: { intro: string; noTeams: string }
    events: { header: HeaderCopy }
    /** News list, home strip and not-found titles (WP-P). `pageNotFoundTitle` is the tab title for an unknown /info page. */
    news: {
      title: string
      empty: string
      notFoundTitle: string
      pageNotFoundTitle: string
      strip: { eyebrow: string; title: string; ctaLabel: string }
    }
    rsvp: {
      /** Header intro on /events/[id]/rsvp; the title is the event's. */
      eyebrow: string
      introYes: string
      introNo: string
    }
    rsvpEdit: { header: HeaderCopy }
    players: { header: HeaderCopy; empty: string; milestones: { heading: string } }
    stats: { header: HeaderCopy; empty: string; notEnoughHeading: string; notEnoughNote: string }
    records: { header: HeaderCopy; empty: string }
    honours: { header: HeaderCopy; empty: string; byHonourLabel: string; byYearLabel: string }
    compare: {
      header: HeaderCopy
      empty: string
      /** Shown when a slug is unknown or the player is hidden. */
      unknownPlayer: string
      sameLabel: string
    }
    statlab: { header: HeaderCopy; empty: string; presetsHeading: string; coverageNote: string }
    yearbooks: { header: HeaderCopy; empty: string; printLabel: string; statsHeading: string; aiNote: string }
    matches: { header: HeaderCopy; empty: string; coverageNote: string; narrowHint: string }
    storyDraftEdit: { header: HeaderCopy }
    emptyStates: { sponsors: string; documents: string; announcements: string }
  }
  navigation: {
    primaryNav: Link[]
    clubhouseLabel: string
    clubhouseNav: Link[]
    navCta: Link
    /** Label of the /news link that appears in Clubhouse and the footer once a post is published. */
    newsLabel: string
    footerNav: { heading: string; columns: Link[][] }
    findUsHeading: string
    /** Appended to the first social's label in the footer. */
    footerSocialSuffix: string
    footerBlurb: string
    fundingCredit: string
    copyrightName: string
  }
}

/** What a club is called and where it is. The builder fills the neutral copy from these. */
export type ClubIdentity = {
  name: string
  shortName: string
  /** How the club refers to itself in running copy ("Life at Riverbend"). */
  familiarName?: string
  /** Shown under the club name and in the copy ("Riverbend, Westland"). */
  location: string
  sport?: string
  siteUrl: string
  locale: string
  ogLocale: string
  email: string
  address: ClubGlobalDefaults['address']
  mapQuery?: string
  /** Stripped from PlayHQ team names for display. */
  teamNamePrefix?: string
  /** Visible label of the "Association directory" document section. */
  associationLabel?: string
}

type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
/** Overrides replace scalars and arrays and merge objects key by key. */
function applyOverrides<T>(base: T, over: unknown): T {
  if (over === undefined) return base
  if (isPlain(base) && isPlain(over)) {
    const out: Record<string, unknown> = { ...base }
    for (const k of Object.keys(over)) out[k] = applyOverrides((base as Record<string, unknown>)[k], over[k])
    return out as T
  }
  return over as T
}

/**
 * The neutral copy for any club (wave F spec 5.2). Pure: identity in, the full `ClubDefaults` out, with nothing about a
 * particular club in the words. A preset (`presets/lang-lang.ts`) is a complete set of defaults for one club; this builder is
 * what a new club starts from, and the bootstrap script writes its output into the `club` global.
 */
export function buildClubDefaults(identity: ClubIdentity, overrides: DeepPartial<ClubDefaults> = {}): ClubDefaults {
  const { name, shortName, location, siteUrl, locale, ogLocale, email } = identity
  const familiar = identity.familiarName || shortName.replace(/\s+(CC|CCC|Cricket Club)$/i, '')
  const locality = identity.address.locality || location
  const sport = identity.sport || 'Cricket'
  const sportLower = sport.toLowerCase()
  const teamNamePrefix = identity.teamNamePrefix ?? ''
  const associationLabel = identity.associationLabel || 'Association directory'

  const base: ClubDefaults = {
  // ---- Identity -----------------------------------------------------------
  name,
  shortName,
  tagline: location,
  sport,
  siteUrl,
  locale,
  ogLocale,

  // ---- Contact & location ------------------------------------------------
  email,
  sponsorshipSubject: 'Sponsorship enquiry',
  teamsSignOff: '',
  address: { ...identity.address },
  associationLabel,
  honourKeywords: [],
  mapQuery: identity.mapQuery ?? `${location}, ${identity.address.countryName}`,

  // ---- Socials -----------------------------------------------------------
  // No URL anywhere today: an empty URL renders as text, and only non-empty URLs feed JSON-LD sameAs.
  socials: [{ platform: 'facebook', url: '', label: 'Find us on Facebook' }],

  // ---- SEO ---------------------------------------------------------------
  defaultTitle: name,
  titleSuffix: ` | ${name}`,
  defaultDescription:
    `${name} — junior and senior ${sportLower} in ${location}. A welcoming community club for beginners through to experienced players.`,
  ogImageAlt: `${name} clubrooms and oval at ${locality}`,
  pages: {
    // Empty: the home page uses defaultTitle / defaultDescription.
    home: { title: '', description: '' },
    sponsors: {
      title: 'Sponsors',
      description: `The local businesses and supporters who back ${name} in ${location}.`,
    },
    gallery: {
      title: 'Gallery',
      description: `Photos from match days, presentations and club life at ${name} in ${location}.`,
    },
    documents: {
      title: 'Documents & Policies',
      description:
        `Codes of conduct, child safety, game day information and policies for members and families of ${name}.`,
    },
    contact: {
      title: 'Contact',
      description:
        `Get in touch with ${name} in ${location}, for playing, sponsorship and general enquiries.`,
    },
    people: {
      title: 'Our People',
      description: `Meet the coaches, committee and volunteers who keep ${name} in ${location} running.`,
    },
    announcements: {
      title: 'Announcements',
      description: `Latest news and notices from ${name} in ${location}.`,
    },
    history: {
      title: 'History',
      description: `Stories, memories and milestones from the long history of ${name} in ${location}.`,
    },
    historySubmit: {
      title: 'Share your story',
      description: `Share your memories of ${name} in ${locality} and help us preserve our history.`,
    },
    events: { title: 'Events', description: 'Upcoming club events, training, and how to RSVP.' },
    players: {
      title: 'Players',
      description:
        `Current and past players of ${name} in ${location}, with career stats and club honours.`,
    },
    fixtures: {
      title: 'Fixtures, Results & Teams',
      description: `Fixtures, results and teams for ${name} in ${location}, across every grade and season.`,
    },
    stats: {
      title: 'Stats & Leaderboards',
      description: `Batting, bowling and fielding leaderboards for ${name} in ${location}, by season and grade.`,
    },
    records: {
      title: 'Club Records',
      description: `Club batting, bowling and fielding records for ${name}, across every season on record.`,
    },
    honours: {
      title: 'Honour Board',
      description: `Life members, premiership players, best and fairest winners and other honours at ${name}.`,
    },
    compare: {
      title: 'Compare Players',
      description: `Compare two ${name} players side by side: batting, bowling and fielding.`,
    },
    statlab: {
      title: 'StatLab',
      description: `Build your own ${name} stats table: pick columns, filters and sorting, and export to CSV.`,
    },
    yearbooks: {
      title: 'Season Yearbooks',
      description: `Season-by-season yearbooks for ${name}: messages from the club, the stats leaders, results and photos.`,
    },
    news: {
      title: 'News',
      description: `The latest news from ${name} in ${location}: results, announcements and club stories.`,
    },
    matches: {
      title: 'Match Archive',
      description: `Every finished ${name} match this season by grade, with results and links to the full scorecards.`,
    },
  },

  // ---- History -----------------------------------------------------------
  history: {
    narrative: [
      `The story of ${name} is still being written. Add the club's history here, or invite members to share their memories and old photos.`,
      `Our home ground in ${locality} gives the next generation of juniors and seniors a place to add their own chapter.`,
    ].join('\n\n'),
    pullQuote: 'You cannot make history without knowing where you started.',
    callout: {
      eyebrow: 'With thanks',
      title: 'The Club Committee',
      body: 'For keeping the details of the club safe and up to date.',
    },
  },
  storySubmitIntro:
    `Old photos, scorebooks, match reports, memories from the clubrooms — tell us your ${familiar} story. A committee member reviews every submission before it appears on the site.`,

  // ---- Defaults-module only (v1) -------------------------------------------
  assets: {
    logo: '/assets/branding/logo.png',
    // 1200×630, ~125KB: the size link previews expect (WhatsApp drops images over ~300KB).
    ogImage: { url: '/og-image.jpg', width: 1200, height: 630 },
    heroImage: '/assets/branding/hero.jpg',
  },
  familiarName: familiar,
  teamNamePrefix,

  home: {
    hero: {
      imageAlt: `The ${name} pavilion and oval at ${locality}`,
      focalY: 60,
      eyebrow: `Junior & senior cricket in ${location}`,
      headline: 'Play your cricket',
      headlineAccent: `with ${familiar}`,
      intro:
        `A community club with room for every player, from first-time juniors to seasoned seniors, based at a modern home ground in ${locality}.`,
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
        body: `Our ${locality} home ground is the heart of the club: a place to train, play and catch up after the game.`,
      },
      {
        icon: 'shield-check',
        title: 'Safe for young players',
        body: "We follow a child safeguarding framework and a Member Protection Policy.",
      },
    ],
    about: {
      eyebrow: 'About the club',
      title: 'Local cricket, played the right way.',
      intro:
        `${name} fields junior and senior sides out of ${locality}. We are a club built by volunteers and families, and we make a point of being welcoming whether you are learning the basics or have played for decades.`,
      body: `Our home ground is the heart of the club. Off the field, the club is committed to a safe and respectful environment for everyone: we follow a child safeguarding framework and a Member Protection Policy that set clear standards for members, coaches and volunteers.`,
      links: [
        { label: 'Our history', href: '/history' },
        { label: 'Policies & documents', href: '/documents' },
      ],
    },
    galleryTeaser: { eyebrow: 'Around the club', title: `Life at ${familiar}`, ctaLabel: 'View the full gallery' },
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
        intro: `Match days, training nights and the people who make ${familiar} what it is. Tap any photo to view it full size.`,
      },
      photosLabel: 'Photos',
      ogImageAltSuffix: ' gallery photo',
    },
    documents: {
      header: {
        eyebrow: 'Documents & policies',
        title: 'Club rules, policies and resources',
        intro:
          `Official association and governing body documents that apply to everyone at ${familiar}. All files open as PDFs.`,
      },
    },
    documentCategories: [
      {
        category: 'Codes of Conduct',
        icon: 'justice-scale',
        blurb: 'Expected behaviour for players, parents and juniors across the association.',
      },
      {
        category: 'Policies',
        icon: 'scroll',
        blurb: 'Association and governing body policies covering weather, social media, screening and complaints.',
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
          `Our home ground is in ${locality}. Come down on a match day and say hello.`,
      },
    },
    contactCards: {
      emailLabel: 'Email',
      homeGroundLabel: 'Home ground',
      socialLabel: 'Social',
      socialNote: 'Match schedules, results and club news.',
    },
    safeguardingNote: {
      text: `${name} follows a child safeguarding framework and a Member Protection Policy. Our policies and codes of conduct are available on the`,
      linkLabel: 'Documents & Policies',
      linkHref: '/documents',
      after: 'page.',
    },
    people: {
      header: {
        eyebrow: 'Clubhouse',
        title: 'Our People',
        intro:
          `${familiar} is run by volunteers: the committee, the senior leadership team and the coaches who give their weekends to our juniors. Here is who they are and how to reach them.`,
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
      imageAlt: `${name} players on the field at ${locality}`,
    },
    fixtures: {
      intro: `The next round, the latest results and every ${familiar} side — straight from PlayHQ.`,
      noTeams: `No ${familiar} sides have been entered for this season yet.`,
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
      `Junior and senior cricket in ${location}. New to the game or a seasoned player, there is a spot for you on the field.`,
    fundingCredit: '',
    copyrightName: name,
  },
  }
  return applyOverrides(base, overrides)
}

/** The admin-editable subset, as `seed-club.ts` writes it. */
export function toClubGlobal(d: ClubDefaults): ClubGlobalDefaults {
  return {
    name: d.name,
    shortName: d.shortName,
    tagline: d.tagline,
    sport: d.sport,
    siteUrl: d.siteUrl,
    locale: d.locale,
    ogLocale: d.ogLocale,
    email: d.email,
    sponsorshipSubject: d.sponsorshipSubject,
    teamsSignOff: d.teamsSignOff,
    address: { ...d.address },
    mapQuery: d.mapQuery,
    associationLabel: d.associationLabel,
    honourKeywords: [...d.honourKeywords],
    socials: d.socials.map((s) => ({ ...s })),
    defaultTitle: d.defaultTitle,
    titleSuffix: d.titleSuffix,
    defaultDescription: d.defaultDescription,
    ogImageAlt: d.ogImageAlt,
    pages: Object.fromEntries(Object.entries(d.pages).map(([k, v]) => [k, { ...v }])) as Record<SeoPage, PageSeo>,
    history: { ...d.history, callout: { ...d.history.callout } },
    storySubmitIntro: d.storySubmitIntro,
  }
}
