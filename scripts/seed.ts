import { db } from '../db'
import { documents, galleryPhotos, sponsors, committeeContacts } from '../db/schema'
import { SPONSORS } from './sponsors-data'

async function main() {
  await db.insert(documents).values([
    { category: 'Codes of Conduct', title: 'CCCA General Code of Conduct', url: '/assets/documents/ccca-general-code-of-conduct.pdf' },
    { category: 'Codes of Conduct', title: 'CCCA Junior Code of Conduct', url: '/assets/documents/ccca-junior-code-of-conduct.pdf' },
    { category: 'Codes of Conduct', title: 'CCCA Parent Code of Conduct', url: '/assets/documents/ccca-parent-code-of-conduct.pdf' },
    { category: 'Policies', title: 'CCCA Extreme Weather Policy', url: '/assets/documents/ccca-extreme-weather-policy.pdf' },
    { category: 'Policies', title: 'CCCA Social Media Policy', url: '/assets/documents/ccca-social-media-policy.pdf' },
    { category: 'Policies', title: 'CCCA WWCC Policy', url: '/assets/documents/ccca-wwcc-policy.pdf' },
    { category: 'Policies', title: 'CV Complaints & Resolution Policy 2024', url: '/assets/documents/cv-complaints-resolution-policy-2024.pdf' },
    { category: 'Policies', title: 'CV Smoke Pollution Guidelines', url: '/assets/documents/cv-smoke-pollution-guidelines.pdf' },
    { category: 'Policies', title: 'CV Suspect Bowling Actions Guidelines', url: '/assets/documents/cv-suspect-bowling-actions-guidelines.pdf' },
    { category: 'Child Safety', title: 'Betrayal of Trust Fact Sheet', url: '/assets/documents/betrayal-of-trust-fact-sheet.pdf' },
    { category: 'Child Safety', title: 'LLCC Conflict Resolution Policy', url: '/assets/documents/llcc-conflict-resolution-policy.pdf' },
    { category: 'Child Safety', title: "Australian Cricket's Policy for Safeguarding Children & Young People", url: '/assets/documents/safeguarding-children-policy.pdf' },
    { category: 'Child Safety', title: "Australian Cricket's Commitment to Safeguarding Children and Young People", url: '/assets/documents/safeguarding-commitment.pdf' },
    { category: 'Child Safety', title: 'Code of Behaviour for Affiliated Associations, Clubs and Indoor Centres', url: '/assets/documents/code-of-behaviour-affiliated-clubs.pdf' },
    { category: 'Game Day', title: 'Marsh Sport Cricket Game Day Training Checklist', url: '/assets/documents/game-day-training-checklist.pdf' },
    { category: 'CCCA Directory', title: 'CCCA Directory 25/26', url: '/assets/documents/ccca-directory-25-26.pdf' },
  ])

  // photo-17..76 (WebP, newest) come first; photo-01..16 are the original JPGs.
  const galleryFiles = [
    ...Array.from({ length: 60 }, (_, i) => `photo-${i + 17}.webp`),
    ...Array.from({ length: 16 }, (_, i) => `photo-${String(i + 1).padStart(2, '0')}.jpg`),
  ]
  await db.insert(galleryPhotos).values(
    galleryFiles.map((f, i) => ({ url: `/assets/gallery/${f}`, caption: '', sortOrder: i }))
  )

  await db.insert(sponsors).values(SPONSORS)

  await db.insert(committeeContacts).values([
    { role: 'President', name: 'Eddie Duiker', phone: '0423 465 992', email: 'langlangcricketclub@gmail.com', sortOrder: 0 },
    { role: 'Treasurer', name: 'Karen Duiker', phone: '0423 201 257', email: 'langlangcricketclub@gmail.com', sortOrder: 1 },
    { role: 'Secretary / Child Safety Officer & Junior Coordinator', name: 'Erin Jozwin', phone: '0421 991 436', email: 'langlangcricketclub@gmail.com', sortOrder: 2 },
    { role: 'Senior Leadership Team', name: 'Brad Savige', sortOrder: 10 },
    { role: 'Senior Leadership Team', name: 'William Wykes', sortOrder: 11 },
    { role: 'Senior Leadership Team', name: 'Russell Savige', sortOrder: 12 },
    { role: 'Senior Leadership Team', name: 'Damien Quinlan', sortOrder: 13 },
    { role: 'Senior Leadership Team', name: 'Nilesh Jayanandana', sortOrder: 14 },
  ])

  console.log('Seed complete.')
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err)
  process.exit(1)
})
