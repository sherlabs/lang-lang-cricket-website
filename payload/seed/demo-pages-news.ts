/**
 * Demo pages and news for `seed:demo` (WP-P). Lang Lang demo copy: a new club replaces these arrays.
 * Pure data (HTML strings are converted to Lexical by the seed script), so it is unit-testable.
 */
export type DemoBlock =
  | { type: 'text'; html: string }
  | { type: 'image'; file: string; alt: string; caption?: string; width?: 'narrow' | 'wide' | 'full' }
  | { type: 'cta'; label: string; url: string; style?: 'primary' | 'outline'; note?: string }

export type DemoPage = {
  title: string
  status: 'draft' | 'published'
  showInNavigation: 'none' | 'clubhouse' | 'primary' | 'footer'
  navOrder: number
  navLabel?: string
  blocks: DemoBlock[]
}

export const DEMO_PAGES: DemoPage[] = [
  {
    title: 'About the club',
    status: 'published',
    showInNavigation: 'clubhouse',
    navOrder: 10,
    blocks: [
      { type: 'text', html: '<p>Lang Lang Cricket Club is a community club in Caldermeade, Victoria, with junior and senior teams and a clubroom that is open to everyone on match days.</p><h2>Who plays</h2><p>Beginners through to experienced players, from Under 10s to seniors. Come along to training and have a hit.</p>' },
      { type: 'image', file: 'assets/branding/hero.jpg', alt: 'The Lang Lang oval and clubrooms on a match day', caption: 'Home ground at the Lang Lang Recreation Reserve', width: 'wide' },
      { type: 'text', html: '<h2>What we value</h2><ul><li>A welcoming place for families</li><li>Fair play and good sportsmanship</li><li>Looking after the ground and each other</li></ul>' },
    ],
  },
  {
    title: 'Join the club',
    status: 'published',
    showInNavigation: 'clubhouse',
    navOrder: 20,
    blocks: [
      { type: 'text', html: '<p>New players of every age are welcome. Registration opens before the season and training starts in the weeks after.</p><h2>How to join</h2><ol><li>Get in touch and tell us who is playing and their age.</li><li>Come to a training session before you commit.</li><li>Register with the club and the league.</li></ol>' },
      { type: 'cta', label: 'Get in touch', url: '/contact', style: 'primary', note: 'We reply within a few days.' },
    ],
  },
  {
    title: 'Ground and directions',
    status: 'published',
    showInNavigation: 'footer',
    navOrder: 30,
    navLabel: 'Ground and directions',
    blocks: [
      { type: 'text', html: '<p>We play at the Lang Lang Recreation Reserve. Park beside the oval and follow the signs to the clubrooms.</p><blockquote>Match days are busy: please arrive early and leave the front lane free for the ambulance.</blockquote>' },
    ],
  },
  {
    title: 'Draft: season plan',
    status: 'draft',
    showInNavigation: 'clubhouse',
    navOrder: 40,
    blocks: [{ type: 'text', html: '<p>Work in progress: grades, training nights and the working bee roster.</p>' }],
  },
]

export type DemoNews = {
  title: string
  html: string
  excerpt: string
  author: string
  /** Gallery file under `public/assets/` (a cover), or null. */
  cover: string | null
  status: 'draft' | 'published'
  /** Days from now: negative is past, positive schedules the post. */
  daysFromNow: number
}

export const DEMO_NEWS: DemoNews[] = [
  {
    title: 'Season launch BBQ a great success',
    excerpt: 'Families, players and sponsors came together to kick off the new season at the oval.',
    html: '<p>More than a hundred people joined us for the season launch barbecue. Thank you to everyone who brought a salad and to the volunteers on the grill.</p><p>Training for the juniors starts next week.</p>',
    author: 'Club committee',
    cover: 'assets/gallery/photo-17.webp',
    status: 'published',
    daysFromNow: -3,
  },
  {
    title: 'Working bee thank-you',
    excerpt: '',
    html: '<p>The nets, the boundary rope and the scoreboard are all in shape thanks to the Saturday working bee. A special thanks to the families who stayed for the last hour.</p>',
    author: '',
    cover: 'assets/gallery/photo-18.webp',
    status: 'published',
    daysFromNow: -10,
  },
  {
    title: 'Under 12s win a thriller',
    excerpt: 'A last-over finish at home gave our Under 12s their third win in a row.',
    html: '<p>Needing eight from the last over, the Under 12s got there with two balls to spare. Well played to everyone, and thanks to the parents who scored and umpired.</p>',
    author: 'Junior coordinator',
    cover: 'assets/gallery/photo-19.webp',
    status: 'published',
    daysFromNow: -17,
  },
  {
    title: 'New sponsor signs on for the season',
    excerpt: 'A local business will back the club for the next two seasons.',
    html: '<p>We are delighted to welcome a new sponsor. Their support helps pay for new gear and ground upkeep, and we will show their logo on the match-day banner.</p>',
    author: 'Club committee',
    cover: 'assets/gallery/photo-20.webp',
    status: 'published',
    daysFromNow: -24,
  },
  {
    title: 'Draft: end-of-season presentation night',
    excerpt: '',
    html: '<p>Details to come: date, venue and the awards list.</p>',
    author: '',
    cover: null,
    status: 'draft',
    daysFromNow: 0,
  },
  {
    title: 'Scheduled: registration opens next fortnight',
    excerpt: 'Registration for the new season opens soon.',
    html: '<p>This post is scheduled: it stays hidden until its date, then appears on the news page and the home page by itself.</p>',
    author: 'Club committee',
    cover: null,
    status: 'published',
    daysFromNow: 14,
  },
]
