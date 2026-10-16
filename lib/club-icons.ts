import {
  BankIcon,
  BookOpen01Icon,
  ClipboardListIcon,
  FileTextIcon,
  JusticeScale01Icon,
  ScrollIcon,
  ShieldCheckIcon,
  TrophyIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { ClubIcon } from '@/payload/seed/club-defaults'

/** The Hugeicons whitelist behind `ClubIcon` names in the club copy (highlights, document categories). */
export const CLUB_ICON_MAP: Record<ClubIcon, typeof FileTextIcon> = {
  'user-group': UserGroupIcon,
  trophy: TrophyIcon,
  bank: BankIcon,
  'shield-check': ShieldCheckIcon,
  'justice-scale': JusticeScale01Icon,
  scroll: ScrollIcon,
  'clipboard-list': ClipboardListIcon,
  'book-open': BookOpen01Icon,
  'file-text': FileTextIcon,
}

export const clubIcon = (name: string) => CLUB_ICON_MAP[name as ClubIcon] ?? FileTextIcon
