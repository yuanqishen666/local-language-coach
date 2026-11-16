import assert from 'node:assert/strict'
import test from 'node:test'
import { preferredPublicUrl } from './lookup/url-reader.js'

test('GitHub blob URLs use the smaller raw text endpoint', () => {
  assert.equal(
    preferredPublicUrl('https://github.com/yuanqishen666/local-language-coach/blob/main/README.md'),
    'https://raw.githubusercontent.com/yuanqishen666/local-language-coach/main/README.md',
  )
  assert.equal(
    preferredPublicUrl('https://www.github.com/example/project/blob/release/docs/guide.md?plain=1#readme'),
    'https://raw.githubusercontent.com/example/project/release/docs/guide.md',
  )
})

test('non-GitHub URLs are left unchanged', () => {
  assert.equal(preferredPublicUrl('https://example.com/page?q=1#part'), 'https://example.com/page?q=1#part')
})
