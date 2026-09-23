import { describe, it, expect } from 'vitest'
import { renderStoryHtml, htmlToExcerpt } from '@/lib/stories-content'

describe('renderStoryHtml', () => {
  it('renders headings, bold marks and images from a Tiptap document', () => {
    const html = renderStoryHtml({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Round 6' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'What a ' },
            { type: 'text', marks: [{ type: 'bold' }], text: 'win' },
          ],
        },
        { type: 'image', attrs: { src: 'https://example.com/photo.jpg', alt: null, title: null } },
      ],
    })
    expect(html).toContain('<h2>Round 6</h2>')
    expect(html).toContain('<strong>win</strong>')
    expect(html).toContain('src="https://example.com/photo.jpg"')
  })
})

describe('htmlToExcerpt', () => {
  it('strips tags and collapses whitespace', () => {
    expect(htmlToExcerpt('<p>Hello   <strong>world</strong></p>')).toBe('Hello world')
  })

  it('returns an empty string for content with no real text', () => {
    expect(htmlToExcerpt('<p></p>')).toBe('')
  })

  it('truncates long text at a word boundary and adds an ellipsis', () => {
    const html = '<p>' + 'word '.repeat(50) + '</p>'
    const excerpt = htmlToExcerpt(html, 20)
    expect(excerpt.length).toBeLessThanOrEqual(21)
    expect(excerpt.endsWith('…')).toBe(true)
  })
})
