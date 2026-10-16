import 'server-only'
import type { ImageResponse } from 'next/og'
import { getClub } from '@/lib/club'
import { getSocialSettings, sponsorsForStrip } from '@/lib/social-queries'
import { themedImageResponse } from '@/lib/theme/og'
import { APPROACHING_CAPTION, CAPTION_VARS, fillTemplate } from './caption'
import { linkPath } from './links'
import { GRAPHICS } from './registry'
import { renderGraphic } from './render'
import { SIZES, type GraphicType, type RawParams, type SizeKey, type StyleKey } from './types'

export type LoadedGraphic = { type: GraphicType; params: unknown; data: unknown }

/** Parse, then load. Null for bad input, an unknown id or anything the loader will not draw (all answer alike). */
export async function loadGraphic(type: GraphicType, raw: RawParams): Promise<LoadedGraphic | null> {
  const g = GRAPHICS[type]
  const params = g.spec.parse(raw)
  if (params === null) return null
  const data = await g.load(params as never)
  return data === null ? null : { type, params, data }
}

/** The picture itself. `style` falls back to the club's default in the settings. */
export async function renderLoaded(loaded: LoadedGraphic, size: SizeKey, style: StyleKey | null, headers: Record<string, string>): Promise<ImageResponse> {
  const [settings, club] = await Promise.all([getSocialSettings(), getClub()])
  const strip = await sponsorsForStrip(settings)
  const chosen = style ?? settings.defaultStyle
  const layout = GRAPHICS[loaded.type].spec.layout(loaded.data, chosen, size)
  return themedImageResponse(
    ({ theme, crestDataUri }) =>
      renderGraphic({
        layout, style: chosen, size, theme, crestDataUri, clubName: club.shortName || club.name, siteHost: settings.showSiteHost ? club.siteUrl.replace(/^https?:\/\//, '') : null, attribution: settings.attribution, strip,
      }),
    { ...SIZES[size], headers },
  )
}

/** The caption for a loaded graphic: the club's template filled from the data. Plain text. */
export async function captionFor(loaded: LoadedGraphic): Promise<{ text: string; unknown: string[]; alt: string }> {
  const [settings, club] = await Promise.all([getSocialSettings(), getClub()])
  const spec = GRAPHICS[loaded.type].spec
  const vars = { ...spec.captionVars(loaded.data), club: club.shortName || club.name, link: `${club.siteUrl}${linkPath(loaded.type, loaded.params)}` }
  const approaching = loaded.type === 'milestone' && (loaded.data as { kind?: string }).kind === 'approaching'
  const filled = fillTemplate(approaching ? APPROACHING_CAPTION : settings.captionTemplates[loaded.type], vars, CAPTION_VARS[loaded.type])
  return { text: filled.text, unknown: filled.unknown, alt: spec.describe(loaded.data) }
}
