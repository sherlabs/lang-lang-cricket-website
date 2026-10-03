/**
 * The Help page, as plain data. The club can edit the words here without touching any layout.
 * Keep it friendly, short and free of jargon. `contacts` shows under "Who to call".
 */
export type HelpSection = { id: string; title: string; steps: string[] }

export const helpIntro = 'Everything on the club website is changed from here. Nothing you do can break the site, and you can always edit or delete something afterwards.'

export const helpSections: HelpSection[] = [
  {
    id: 'event',
    title: 'Add an event',
    steps: [
      'Click "Add an event" on the Home page (or Events, then "Create new").',
      'Type the event name, pick the day and the start time, and say where it is.',
      'Add a short description and a picture if you have one.',
      'Want people to RSVP for dinner? Open "Dinner and tickets" and add the meal choices.',
      'Click Save. The event shows on the website straight away.',
    ],
  },
  {
    id: 'announcement',
    title: 'Post an announcement',
    steps: [
      'Click "Post an announcement" on the Home page.',
      'Write a headline and your message. The first line shows in the banner on the home page.',
      'Switch on "Show on the website" when you are ready for everyone to see it, then click Save.',
      'To take it down later, open it, switch "Show on the website" off and Save.',
    ],
  },
  {
    id: 'photos',
    title: 'Add photos to the gallery',
    steps: [
      'Click "Add photos to the gallery".',
      'Drop a picture onto the box, or click to choose one from your phone or computer.',
      'Add a short caption if you like, then Save.',
      'Have lots to add? Open Photo gallery and click "Bulk Upload" to add many at once.',
      'Photos from an event go on that event: open the event and scroll to its photos.',
    ],
  },
  {
    id: 'approve',
    title: 'Approve stories and photos',
    steps: [
      'Members can send in stories and photos from the website. They wait for you before anyone sees them.',
      'A number appears next to "Waiting for approval" in the menu when something needs a look.',
      'Open it, read it, then click Approve to put it on the website, or Reject to say no.',
    ],
  },
  {
    id: 'people',
    title: 'Update a sponsor or a contact',
    steps: [
      'Open Sponsors or Committee & contacts from the menu.',
      'Click the name you want to change, edit it, and click Save.',
      'To remove someone, open them and use the three dots at the top, then Delete.',
      'A person\u2019s picture, phone and email are changed in this one place. The home page, Contact, Our People and (if they also play) the Players pages all update by themselves.',
      'If a committee member also plays, pick them under "Also a player". Then you only need to add their picture once.',
      'Does someone hold two jobs, such as President and First Aid Officer? Add them once, then use "Other jobs" to add the second job. Please do not add the same person twice: they will show under each group with the same picture.',
    ],
  },
  {
    id: 'player-sponsor',
    title: 'Add a player sponsor',
    steps: [
      'First make sure the business is under Sponsors (use the level "Player"). Its logo and website come from there.',
      'Open Player sponsors and click "Create new". Pick the player and the sponsor, add a short message if you like, then Save.',
      'It shows on the Players page and on that player\u2019s own page. Switch "Show on the website" off to hide it without deleting it.',
    ],
  },
  {
    id: 'apparel',
    title: 'Change the club apparel link',
    steps: [
      'Open "Club apparel link" in the menu.',
      'Paste the full web address of the shop (it starts with https://) and click Save.',
      'A gold button appears in the menu, on the home page and in the footer. Clear the address and Save to hide it everywhere.',
    ],
  },
]

export const helpContacts: { who: string; how: string }[] = [
  { who: 'Stuck, or something looks wrong?', how: 'Ask the person who set up the website for the club.' },
  { who: 'Need a new login or a password reset?', how: 'Ask the website administrator. They can set a new password for you.' },
]
