import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import test from 'node:test'
import { gzipSync } from 'node:zlib'
import { isPublicAddress, preferredPublicUrl, publicAddressesOf, readPublicUrl } from './lookup/url-reader.js'

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

test('only addresses out on the public internet count as public', () => {
  const open = [
    '93.184.216.34', '8.8.8.8', '100.63.255.255', '100.128.0.1', '172.15.0.1', '172.32.0.1', '2606:4700:4700::1111', '2a00:1450:4001:81b::200e',
    '::ffff:8.8.8.8', '::ffff:808:808', '64:ff9b::8.8.8.8', '2002:808:808::1',
  ]
  const closed = [
    '127.0.0.1', '127.255.255.254', '0.0.0.0', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254',
    '100.64.0.1', '100.127.255.255', '192.0.0.8', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '::ffff:10.0.0.1', '::ffff:172.16.0.1', '::ffff:100.64.0.1', '::7f00:1', '::127.0.0.1',
    '64:ff9b::7f00:1', '64:ff9b::10.0.0.1', '2002:7f00:1::1', '2002:a00:1::', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:db8::1',
    'fc00::1', 'fd12:3456:789a::1', 'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '100::1', 'not an address', '', '1.2.3', '999.1.1.1',
  ]
  for (const address of open) assert.equal(isPublicAddress(address), true, address)
  for (const address of closed) assert.equal(isPublicAddress(address), false, address)
})

/** A web server on this machine, standing for whatever a learner's computer or its network has listening. */
async function localServer(answer: http.RequestListener) {
  const asked: Array<{ path: string; host: string }> = []
  const server = http.createServer((request, response) => {
    asked.push({ path: request.url || '', host: request.headers.host || '' })
    answer(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  return { port, asked, close: () => new Promise((resolve) => server.close(resolve)) }
}

const onThisMachine = async () => [{ address: '127.0.0.1', family: 4 }]

test('an address on this machine is refused however it is written, and nothing is sent to it', async () => {
  const local = await localServer((_request, response) => response.end('private'))
  try {
    const hosts = ['127.0.0.1', 'localhost', 'localhost.', '[::1]', '[::ffff:7f00:1]', '[::ffff:127.0.0.1]', '[::7f00:1]', '2130706433', '0x7f.1', '127.1', '0.0.0.0', '[::]']
    for (const host of hosts) {
      await assert.rejects(readPublicUrl(`http://${host}:${local.port}/`, 2000), /UNSAFE_URL/u, host)
    }
    await assert.rejects(readPublicUrl(`http://someone:secret@example.com/`, 2000), /UNSAFE_URL/u)
    assert.deepEqual(local.asked, [])
  } finally {
    await local.close()
  }
})

test('the page is asked of the addresses that were checked, under the name it was asked for', async () => {
  const page = gzipSync('<html><head><title>A &amp; B</title><script>hidden()</script></head><body><p>Readable text.</p></body></html>')
  const local = await localServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-encoding': 'gzip' })
    response.end(page)
  })
  try {
    // The name stands for nothing: only a connection made to the given address can reach the server.
    const item = await readPublicUrl(`http://page.invalid:${local.port}/article`, 2000, onThisMachine)
    assert.equal(item.title, 'A & B')
    assert.equal(item.content, 'A & B Readable text.')
    assert.deepEqual(local.asked, [{ path: '/article', host: `page.invalid:${local.port}` }])
  } finally {
    await local.close()
  }
})

test('a page cannot send the reader on to an address on this machine', async () => {
  const local = await localServer((request, response) => {
    if (request.url === '/start') response.writeHead(302, { location: `http://[::ffff:7f00:1]:${local.port}/private` }).end()
    else response.end('private')
  })
  try {
    const addressesOf = (url: URL) => (url.hostname === 'start.invalid' ? onThisMachine() : publicAddressesOf(url))
    await assert.rejects(readPublicUrl(`http://start.invalid:${local.port}/start`, 2000, addressesOf), /UNSAFE_URL/u)
    assert.deepEqual(local.asked.map((request) => request.path), ['/start'])
  } finally {
    await local.close()
  }
})

test('a page larger than the limit is given up on', async () => {
  const local = await localServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end('x'.repeat(1_200_000))
  })
  try {
    await assert.rejects(readPublicUrl(`http://big.invalid:${local.port}/`, 2000, onThisMachine), /PAGE_TOO_LARGE/u)
  } finally {
    await local.close()
  }
})
