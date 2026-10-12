import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { vercelBlobStorage } from '@payloadcms/storage-vercel-blob'
import path from 'path'
import { buildConfig } from 'payload'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { BRANDING } from './config/site'
import { adminTitleSuffix, adminTranslations } from './payload/admin/copy'
import { restrictBuiltinCollections } from './payload/access/builtins'
import { assertLocalDb, assertSafeEnv, blobToken, csrfOrigins, requireEnv, resolveServerURL } from './payload/env'
import { AiDraftCounter } from './payload/collections/AiDraftCounter'
import { Announcements } from './payload/collections/Announcements'
import { Availability } from './payload/collections/Availability'
import { Documents } from './payload/collections/Documents'
import { EventPhotos } from './payload/collections/EventPhotos'
import { EventRsvps } from './payload/collections/EventRsvps'
import { Events } from './payload/collections/Events'
import { GalleryPhotos } from './payload/collections/GalleryPhotos'
import { MatchAppearances } from './payload/collections/MatchAppearances'
import { MatchBatting } from './payload/collections/MatchBatting'
import { MatchBowling } from './payload/collections/MatchBowling'
import { MatchFielding } from './payload/collections/MatchFielding'
import { MatchInnings } from './payload/collections/MatchInnings'
import { Matches } from './payload/collections/Matches'
import { MergeLog } from './payload/collections/MergeLog'
import { Media } from './payload/collections/Media'
import { News } from './payload/collections/News'
import { Pages } from './payload/collections/Pages'
import { People } from './payload/collections/People'
import { PlayerAliases } from './payload/collections/PlayerAliases'
import { PlayerSelectionProfiles } from './payload/collections/PlayerSelectionProfiles'
import { SelectionFixtures } from './payload/collections/SelectionFixtures'
import { SquadMembers, Squads } from './payload/collections/Squads'
import { TeamSheets } from './payload/collections/TeamSheets'
import { BestPlayerBallots } from './payload/collections/BestPlayerBallots'
import { NetAttendance } from './payload/collections/NetAttendance'
import { NetSessions } from './payload/collections/NetSessions'
import { Members } from './payload/collections/Members'
import { OfficeAuditLog } from './payload/collections/OfficeAuditLog'
import { MembershipTiers } from './payload/collections/MembershipTiers'
import { Memberships } from './payload/collections/Memberships'
import { FeeCharges, FeePayments, FeeSeasons, FeeWaivers } from './payload/collections/feeLedger'
import { VolunteerAssignments, VolunteerAvailability, VolunteerHours, VolunteerShifts, VolunteerWeeks } from './payload/collections/volunteers'
import { CommitteeSeats } from './payload/collections/CommitteeSeats'
import { CommitteeDocuments, MeetingActions, MeetingAttendance, MeetingItems, MeetingMotions, MeetingTemplates, Meetings } from './payload/collections/meetings'
import { OfficeFiles } from './payload/collections/OfficeFiles'
import { DiaryJobs, PlanObjectives, PlanPillars } from './payload/collections/diary'
import { SocialPosts } from './payload/collections/SocialPosts'
import { SocialPostTargets } from './payload/collections/SocialPostTargets'
import { SavedReports } from './payload/collections/SavedReports'
import { Players } from './payload/collections/Players'
import { PlayerSponsors } from './payload/collections/PlayerSponsors'
import { PlayerSeasons } from './payload/collections/PlayerSeasons'
import { PlayerSyncRuns } from './payload/collections/PlayerSyncRuns'
import { Sponsors } from './payload/collections/Sponsors'
import { Stories } from './payload/collections/Stories'
import { ThrottleHits } from './payload/collections/ThrottleHits'
import { Users } from './payload/collections/Users'
import { Yearbooks } from './payload/collections/Yearbooks'
import { selectorEndpoints } from './payload/endpoints/selectors'
import { historyImportEndpoints } from './payload/endpoints/historyImport'
import { Club } from './payload/globals/Club'
import { ClubApparel } from './payload/globals/ClubApparel'
import { SelectionSettings } from './payload/globals/SelectionSettings'
import { SiteSettings } from './payload/globals/SiteSettings'
import { OfficeSettings } from './payload/globals/OfficeSettings'
import { SocialSettings } from './payload/globals/SocialSettings'
import { Theme } from './payload/globals/Theme'
import { guardLegacyBlobDeletes } from './payload/plugins/guardLegacyBlobDeletes'

// First statement: every entry point (next dev/start/build, the payload CLI incl.
// migrate:fresh/down, `payload run` scripts, tests) loads this file.
assertSafeEnv()

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const serverURL = resolveServerURL()
const token = blobToken()

export default buildConfig({
  serverURL,
  // Explicit: an empty list would disable the Origin check on cookie auth.
  csrf: csrfOrigins(serverURL),
  secret: requireEnv('PAYLOAD_SECRET'),
  admin: {
    user: Users.slug,
    importMap: { baseDir: path.resolve(dirname) },
    // Light, spacious look for the committee (see payload/components/admin.css).
    theme: 'light',
    meta: {
      titleSuffix: adminTitleSuffix,
      icons: [{ rel: 'icon', type: 'image/png', url: BRANDING.logo }],
    },
    components: {
      graphics: { Logo: '/payload/components/Logo#Logo', Icon: '/payload/components/Icon#Icon' },
      // The sidebar is drawn by AdminNav (flat, role-aware); see payload/admin/navigation.ts.
      beforeNavLinks: ['/payload/components/AdminNav#AdminNav'],
      views: {
        dashboard: { Component: '/payload/components/Dashboard#Dashboard' },
        approvals: { Component: '/payload/components/ApprovalsView#ApprovalsView', path: '/approvals', meta: { title: 'Waiting for approval' } },
        playerDataTools: { Component: '/payload/components/PlayerDataToolsView#PlayerDataToolsView', path: '/player-data-tools', meta: { title: 'Player data tools' } },
        selectors: { Component: '/payload/components/SelectorsView#SelectorsView', path: '/selectors', meta: { title: 'Selectors' } },
        social: { Component: '/payload/components/SocialView#SocialView', path: '/social', meta: { title: 'Social posts' } },
        office: { Component: '/payload/components/OfficeView#OfficeView', path: '/office', exact: true, meta: { title: 'Club office' } },
        officeMembers: { Component: '/payload/components/OfficeMembersView#OfficeMembersView', path: '/office/members', meta: { title: 'Members' } },
        officeFees: { Component: '/payload/components/OfficeFeesView#OfficeFeesView', path: '/office/fees', exact: true, meta: { title: 'Fees' } },
        officeFeeMember: { Component: '/payload/components/OfficeFeeMemberView#OfficeFeeMemberView', path: '/office/fees/member/:id', meta: { title: 'Member fees' } },
        officeVolunteers: { Component: '/payload/components/OfficeVolunteersView#OfficeVolunteersView', path: '/office/volunteers', exact: true, meta: { title: 'Volunteers' } },
        officeVolunteerWeek: { Component: '/payload/components/OfficeVolunteerWeekView#OfficeVolunteerWeekView', path: '/office/volunteers/week/:id', meta: { title: 'Volunteer week' } },
        officeVolunteerHours: { Component: '/payload/components/OfficeVolunteerHoursView#OfficeVolunteerHoursView', path: '/office/volunteers/hours', meta: { title: 'Volunteer hours' } },
        officeMeetings: { Component: '/payload/components/OfficeMeetingsView#OfficeMeetingsView', path: '/office/meetings', exact: true, meta: { title: 'Meetings' } },
        officeMeetingActions: { Component: '/payload/components/OfficeMeetingActionsView#OfficeMeetingActionsView', path: '/office/meetings/actions', meta: { title: 'Committee actions' } },
        officeMeetingDocuments: { Component: '/payload/components/OfficeMeetingDocumentsView#OfficeMeetingDocumentsView', path: '/office/meetings/documents', meta: { title: 'Office-bearer documents' } },
        officeMeetingMinutes: { Component: '/payload/components/OfficeMeetingMinutesView#OfficeMeetingMinutesView', path: '/office/meetings/:id/minutes', meta: { title: 'Minutes' } },
        officeMeeting: { Component: '/payload/components/OfficeMeetingView#OfficeMeetingView', path: '/office/meetings/:id', meta: { title: 'Meeting' } },
        officeDiary: { Component: '/payload/components/OfficeDiaryView#OfficeDiaryView', path: '/office/diary', exact: true, meta: { title: 'Season diary' } },
        officePlan: { Component: '/payload/components/OfficePlanView#OfficePlanView', path: '/office/plan', exact: true, meta: { title: 'Strategic plan' } },
        help: { Component: '/payload/components/HelpView#HelpView', path: '/help', meta: { title: 'Help' } },
      },
    },
  },
  i18n: { translations: adminTranslations },
  graphQL: { disable: true },
  collections: [Users, Media, Documents, GalleryPhotos, Sponsors, People, Announcements, Events, EventRsvps, EventPhotos, Stories, Players, PlayerAliases, PlayerSeasons, PlayerSyncRuns, PlayerSponsors, Yearbooks, Pages, News, Matches, MatchInnings, MatchAppearances, MatchBatting, MatchBowling, MatchFielding, SavedReports, MergeLog, AiDraftCounter, ThrottleHits, PlayerSelectionProfiles, SelectionFixtures, Availability, Squads, SquadMembers, TeamSheets, BestPlayerBallots, NetSessions, NetAttendance, SocialPosts, SocialPostTargets, Members, OfficeAuditLog, MembershipTiers, Memberships, FeeSeasons, FeeCharges, FeePayments, FeeWaivers, VolunteerWeeks, VolunteerShifts, VolunteerAssignments, VolunteerAvailability, VolunteerHours, CommitteeSeats, MeetingTemplates, Meetings, MeetingItems, MeetingAttendance, MeetingMotions, MeetingActions, OfficeFiles, CommitteeDocuments, PlanPillars, PlanObjectives, DiaryJobs],
  globals: [Club, ClubApparel, SiteSettings, Theme, SelectionSettings, SocialSettings, OfficeSettings],
  endpoints: [...historyImportEndpoints, ...selectorEndpoints],
  editor: lexicalEditor(),
  onInit: restrictBuiltinCollections,
  db: postgresAdapter({
    pool: {
      connectionString: requireEnv('DATABASE_URI'),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    },
    schemaName: 'payload',
    // Opt-in, dev only, local only (assertLocalDb throws for a remote host).
    push: process.env.NODE_ENV !== 'production' && process.env.PAYLOAD_PUSH === 'true' && assertLocalDb(),
    migrationDir: path.resolve(dirname, 'payload/migrations'),
    // ETL only (spec §12.3): the running app never accepts client-chosen ids.
    allowIDOnCreate: process.env.PAYLOAD_ETL === 'true',
  }),
  sharp,
  plugins: [
    // Office-bearer files: a separate instance with client uploads OFF, so the browser never receives a blob address, and with
    // Payload's access-controlled download route ON (spec 6.5). The first instance below does not manage this collection.
    guardLegacyBlobDeletes(
      vercelBlobStorage({
        enabled: Boolean(token),
        token,
        clientUploads: false,
        alwaysInsertFields: true,
        // No disablePayloadAccessControl: the default is the access-controlled download route.
        collections: { 'office-files': { prefix: 'office' } },
      }),
    ),
    guardLegacyBlobDeletes(
      vercelBlobStorage({
        enabled: Boolean(token),
        token,
        clientUploads: true,
        // Same schema (prefix/_objectKey columns) with or without a token.
        alwaysInsertFields: true,
        collections: {
          // MUST be '' — any other collection prefix nests per-row prefixes (spec §1).
          media: { prefix: '', disablePayloadAccessControl: true },
          documents: { prefix: 'documents', disablePayloadAccessControl: true },
          'gallery-photos': { prefix: 'gallery', disablePayloadAccessControl: true },
          'event-photos': { prefix: 'events', disablePayloadAccessControl: true },
        },
      }),
    ),
  ],
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
