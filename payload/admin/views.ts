/**
 * Every custom admin view registered in `payload.config.ts` (`admin.components.views`), in one list (wave G WP-5). Payload does not
 * gate custom views, so each one calls `requireStaff` itself (admin or editor; selectors and visitors never get in).
 * `tests/admin-view-guard.test.ts` fails when a view is registered in the config but missing here, when an entry has no matching
 * config view, and when a view's component does not call `requireStaff` in its body.
 *
 * `gate: 'payload'` is the Home view only: Payload redirects signed-out visitors before it renders, and the page wrapper covers the
 * false-bounce case.
 */
export type RegisteredView = { key: string; file: string; component: string; path: string | null; gate: 'staff' | 'payload' }

export const registeredViews: readonly RegisteredView[] = [
  { key: 'dashboard', file: 'Dashboard', component: 'Dashboard', path: null, gate: 'payload' },
  { key: 'approvals', file: 'ApprovalsView', component: 'ApprovalsView', path: '/approvals', gate: 'staff' },
  { key: 'playerDataTools', file: 'PlayerDataToolsView', component: 'PlayerDataToolsView', path: '/player-data-tools', gate: 'staff' },
  { key: 'selectors', file: 'SelectorsView', component: 'SelectorsView', path: '/selectors', gate: 'staff' },
  { key: 'fantasy', file: 'FantasyView', component: 'FantasyView', path: '/fantasy', gate: 'staff' },
  { key: 'social', file: 'SocialView', component: 'SocialView', path: '/social', gate: 'staff' },
  { key: 'office', file: 'OfficeView', component: 'OfficeView', path: '/office', gate: 'staff' },
  { key: 'officeMembers', file: 'OfficeMembersView', component: 'OfficeMembersView', path: '/office/members', gate: 'staff' },
  { key: 'officeFees', file: 'OfficeFeesView', component: 'OfficeFeesView', path: '/office/fees', gate: 'staff' },
  { key: 'officeFeeMember', file: 'OfficeFeeMemberView', component: 'OfficeFeeMemberView', path: '/office/fees/member/:id', gate: 'staff' },
  { key: 'officeVolunteers', file: 'OfficeVolunteersView', component: 'OfficeVolunteersView', path: '/office/volunteers', gate: 'staff' },
  { key: 'officeVolunteerWeek', file: 'OfficeVolunteerWeekView', component: 'OfficeVolunteerWeekView', path: '/office/volunteers/week/:id', gate: 'staff' },
  { key: 'officeVolunteerHours', file: 'OfficeVolunteerHoursView', component: 'OfficeVolunteerHoursView', path: '/office/volunteers/hours', gate: 'staff' },
  { key: 'officeMeetings', file: 'OfficeMeetingsView', component: 'OfficeMeetingsView', path: '/office/meetings', gate: 'staff' },
  { key: 'officeMeetingActions', file: 'OfficeMeetingActionsView', component: 'OfficeMeetingActionsView', path: '/office/meetings/actions', gate: 'staff' },
  { key: 'officeMeetingDocuments', file: 'OfficeMeetingDocumentsView', component: 'OfficeMeetingDocumentsView', path: '/office/meetings/documents', gate: 'staff' },
  { key: 'officeMeetingMinutes', file: 'OfficeMeetingMinutesView', component: 'OfficeMeetingMinutesView', path: '/office/meetings/:id/minutes', gate: 'staff' },
  { key: 'officeMeeting', file: 'OfficeMeetingView', component: 'OfficeMeetingView', path: '/office/meetings/:id', gate: 'staff' },
  { key: 'officeEmail', file: 'OfficeEmailView', component: 'OfficeEmailView', path: '/office/email', gate: 'staff' },
  { key: 'officeEmailCampaign', file: 'OfficeEmailCampaignView', component: 'OfficeEmailCampaignView', path: '/office/email/:id', gate: 'staff' },
  { key: 'officeDiary', file: 'OfficeDiaryView', component: 'OfficeDiaryView', path: '/office/diary', gate: 'staff' },
  { key: 'officeStock', file: 'OfficeStockView', component: 'OfficeStockView', path: '/office/stock', gate: 'staff' },
  { key: 'officeStockStocktake', file: 'OfficeStockStocktakeView', component: 'OfficeStockStocktakeView', path: '/office/stock/stocktake', gate: 'staff' },
  { key: 'officeStockPerson', file: 'OfficeStockPersonView', component: 'OfficeStockPersonView', path: '/office/stock/people/:id', gate: 'staff' },
  { key: 'officeStockItem', file: 'OfficeStockItemView', component: 'OfficeStockItemView', path: '/office/stock/item/:id', gate: 'staff' },
  { key: 'officePlan', file: 'OfficePlanView', component: 'OfficePlanView', path: '/office/plan', gate: 'staff' },
  { key: 'help', file: 'HelpView', component: 'HelpView', path: '/help', gate: 'staff' },
]
