import { describe, expect, it } from 'vitest'
import { parsePreviewParams } from '../lib/preview'

describe('parsePreviewParams', () => {
  it('accepts pages and news with a plain numeric id', () => {
    expect(parsePreviewParams('pages', '12')).toEqual({ collection: 'pages', id: 12 })
    expect(parsePreviewParams('news', '1')).toEqual({ collection: 'news', id: 1 })
  })
  it.each([['users', '1'], ['stories', '1'], ['Pages', '1'], ['', '1'], ['pages', 'abc'], ['pages', '1e3'], ['pages', '-1'], ['pages', '1.5'], ['pages', ' 1'], ['pages', ''], ['pages', '0'], ['pages', '99999999999999999999']])('rejects %s / %s', (c, id) => {
    expect(parsePreviewParams(c, id)).toBeNull()
  })
})
