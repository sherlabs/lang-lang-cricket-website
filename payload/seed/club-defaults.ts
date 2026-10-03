/**
 * The club's identity and copy (spec §4.1, D9). Every string the public site used to
 * hard-code lives here, lifted verbatim (content-misc map §8). Three consumers:
 * - the `club` global's field `defaultValue`s (payload/globals/Club.ts);
 * - `seed-club.ts` (writes the global part of this object);
 * - `getClub()` (lib/club.ts), which merges the saved global over these values, so pages
 *   render identically before the global is ever seeded.
 *
 * `ClubGlobalDefaults` mirrors the admin-editable `club` global. The other groups
 * (`home`, `pageCopy`, `navigation`) are defaults-module only in v1: typed and returned by
 * `getClub()`, but not editable in the admin. Promoting them to global tabs later is additive.
 *
 * Pure data: no Payload, React or Next imports (the frontend and the admin both import it).
 */

import { PLAYHQ_DEFAULTS } from '../../config/site'

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
  'statlab',
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
  address: { locality: string; region: string; regionName: string; country: string; countryName: string }
  mapQuery: string
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
    rsvp: {
      /** Header intro on /events/[id]/rsvp; the title is the event's. */
      eyebrow: string
      introYes: string
      introNo: string
    }
    rsvpEdit: { header: HeaderCopy }
    players: { header: HeaderCopy; empty: string }
    stats: { header: HeaderCopy; empty: string; notEnoughHeading: string; notEnoughNote: string }
    records: { header: HeaderCopy; empty: string }
    storyDraftEdit: { header: HeaderCopy }
    emptyStates: { sponsors: string; documents: string; announcements: string }
  }
  navigation: {
    primaryNav: Link[]
    clubhouseLabel: string
    clubhouseNav: Link[]
    navCta: Link
    footerNav: { heading: string; columns: Link[][] }
    findUsHeading: string
    /** Appended to the first social's label in the footer. */
    footerSocialSuffix: string
    footerBlurb: string
    fundingCredit: string
    copyrightName: string
  }
}

const NAME = 'Lang Lang Cricket Club'

export const clubDefaults: ClubDefaults = {
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
  address: { locality: 'Caldermeade', region: 'VIC', regionName: 'Victoria', country: 'AU', countryName: 'Australia' },
  mapQuery: 'Caldermeade, Victoria, Australia',

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
    statlab: {
      title: 'StatLab',
      description: 'Build your own Lang Lang Cricket Club stats table: pick columns, filters and sorting, and export to CSV.',
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
  teamNamePrefix: PLAYHQ_DEFAULTS.teamNamePrefix,

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
      { category: 'CCCA Directory', icon: 'book-open', blurb: 'Association contacts and club listings for the current season.' },
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

/** The admin-editable subset, as `seed-club.ts` writes it. */
export function clubGlobalSeed(d: ClubDefaults = clubDefaults): ClubGlobalDefaults {
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
    address: { ...d.address },
    mapQuery: d.mapQuery,
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
