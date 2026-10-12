/**
 * The Help page, as plain data. The club can edit the words here without touching any layout.
 * Keep it friendly, short and free of jargon. `contacts` shows under "Who to call".
 */
export type HelpSection = { id: string; title: string; steps: string[] }

export const helpIntro = 'Everything on the club website is changed from here. Nothing you do can break the site, and you can always edit or delete something afterwards.'

export const helpSections: HelpSection[] = [
  {
    id: 'club-fees',
    title: 'Keep track of fees and payments (admins)',
    steps: [
      'Click "Club office", then "Fees". Pick the season at the top.',
      'The first time, open "Set up fees", add a membership type (a fee for the season, a fee per game, or both), then add the members to the season.',
      'Match fees appear by themselves as games are played. Click a member to record a payment, check "Show what this will settle", then save. For a family, tick the children under "Split across".',
      'To waive a fee, open the member and press "Waive a fee". You must give a reason. To undo a payment or waiver, press "Void" and say why. Nothing is ever deleted.',
      'At the end of the season press "Close season". The figures are then frozen. Never type card numbers: money is recorded by hand only.',
    ],
  },
  {
    id: 'club-volunteers',
    title: 'Roster volunteers for game days',
    steps: [
      'Click "Club office", then "Volunteers". Press "Create weeks from the home games", then click a game day.',
      'Add the jobs for that day (canteen, bar, gate), then add people to each job. The people who said Yes come first. Warnings are advice only.',
      'Press "Open for answers" so volunteers can say Yes, Maybe or No from their own link. Copy each person\u2019s link from "Personal links for volunteers" and send it privately.',
      'After the game day, press "Confirm week and post hours". Mark anyone who did not turn up. Made a mistake? "Reopen this week" undoes the hours so you can fix the roster.',
      'Open "Hours report" for totals. Groups of fewer than 3 people are hidden so a report never points at one person. Admins also see hours by person and can download them.',
    ],
  },
  {
    id: 'club-office',
    title: 'Look after the club members (admins)',
    steps: [
      'Click "Club office" in the menu, then "Members". Only admins can open Members.',
      'Press "Add members for players who have none" the first time. It adds one entry for every player, without any contact details.',
      'To add someone else, open "Add a member", type their name, tick at least one role, add an email and phone if you have them, then press "Add member".',
      'Use the "No email" and "No phone" buttons to see who to chase. Click a name to change their details.',
      'To get a spreadsheet, set the filters you want and press "Download CSV". Tick the extra box only if you really need date of birth, emergency contact or notes. Every download is logged.',
      'If someone asks you to delete their details, press "Remove details" on their row, tick the box and confirm. This cannot be undone.',
    ],
  },
  {
    id: 'selector',
    title: 'Add a selector',
    steps: [
      'Click "Add a selector" on the Home page (or Advanced, then Selectors).',
      'Type their name and email, then click "Add selector".',
      'Copy the link that appears, or share it by text or WhatsApp. It is shown only once, works for 14 days and works once.',
      'They open the link on their phone, then sign in with Facebook (when the club has set that up) or choose a password.',
      'To stop someone picking teams, click Disable on their row. To start again, click Enable, or "New invite link" for a fresh link.',
    ],
  },
  {
    id: 'social',
    title: 'Make a social post',
    steps: [
      'Click "Make a social post" on the Home page (or Advanced, then Social posts).',
      'Pick what to post: a result, the weekend games, a team, the award winner of a game, a milestone, an event or a thank-you to a sponsor.',
      'Choose the game, player or event it is about. Pick the size you need: Square for most posts, Story for stories, Wide for a link.',
      'On a phone, tap "Share or save to Photos". On a computer, click "Download picture".',
      'Tap "Copy caption", then paste it into Facebook, Instagram or X. You can change the words first.',
      'A player under 18 only appears on pictures once a parent or guardian has agreed and you have ticked "OK to post on social media" on the player.',
      'To post later, scroll to "Schedule it": pick the network, the day and the time, check the words, then click Schedule. Use "Save as draft" to come back to it.',
      'Your posts are listed below. If one did not go out, open "Needs attention": you can retry it, or download the picture and copy the caption and post it by hand, then click "Mark as posted".',
    ],
  },
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
      'An announcement is a short banner for something urgent. For a dated article with a picture use "Post news", and for the club\u2019s long-lived history use Club history stories.',
    ],
  },
  {
    id: 'nickname',
    title: 'Show a nickname for a player',
    steps: [
      'Open Players and click the player.',
      'Type the name you want shown on the website under "Preferred name", for example a nickname.',
      'Click Save. The website shows that name everywhere. The address of their page does not change, and clearing the box brings the full name back.',
    ],
  },
  {
    id: 'season-summary',
    title: 'Check a season summary before it goes live',
    steps: [
      'Open Season yearbooks and click the season. The "Season summary" box can be written by hand.',
      'If the site administrator asked the AI for a draft, the box says "AI-assisted draft, please check". The AI can be wrong, so read all of it and correct anything that is not true.',
      'Tick "I have read and corrected this text", then set the status to Published and Save.',
      'If you change the words afterwards, the tick clears and you tick it again. Clearing the whole box removes the AI mark.',
    ],
  },
  {
    id: 'page',
    title: 'Add a page',
    steps: [
      'Click "Add a page" on the Home page (or Pages, then "Create new").',
      'Type the page title, for example "Join the club".',
      'Under "Page content" click "Add Text", "Add Picture" or "Add Button". Drag them into the order you want.',
      'Under "Where should a link to this page appear?" choose the Clubhouse menu, the main menu or the footer.',
      'Leave the status as Draft and use the Preview button to see it first. When you are happy, set the status to Published and Save. The link appears in the menu within a few minutes.',
    ],
  },
  {
    id: 'news',
    title: 'Post news',
    steps: [
      'Click "Post news" on the Home page (or News, then "Create new").',
      'Type a headline, add a picture if you have one, and write the post.',
      'Use the Preview button to see it as visitors will, then set the status to Published and Save.',
      'It shows on the News page and the home page. Choose a later date under "Show from" to have it appear by itself on that day.',
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
