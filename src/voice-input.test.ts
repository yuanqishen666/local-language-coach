import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appendSpoken, base64Of, browsersFor, captureProblem, chooseVoiceRoute, compareReading, createSilenceWatch, encodeWav, loudness, otherBrowsers,
  pausesBetween, recognitionBroken, recognitionProblem, recognitionSupport, resample, voiceBrowser, voiceSystem,
} from './voice-input'
import { VOICE_SAMPLE_RATE, wavSeconds } from '../shared/voice'

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15',
  firefoxMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:150.0) Gecko/20100101 Firefox/150.0',
  operaWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/125.0.0.0',
  chromeLinux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  safariPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1',
  chromePhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0.0.0 Mobile/15E148 Safari/604.1',
  wechatPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50(0x18003233) NetType/WIFI Language/zh_CN',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 15; Mobile; rv:150.0) Gecko/150.0 Firefox/150.0',
  webviewAndroid: 'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/142.0.0.0 Mobile Safari/537.36',
  samsungAndroid: 'Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
}

function support(userAgent: string, hasRecognition: boolean, extra: { secure?: boolean; standalone?: boolean; maxTouchPoints?: number } = {}) {
  const result = recognitionSupport({ userAgent, hasRecognition, secure: extra.secure ?? true, standalone: extra.standalone, maxTouchPoints: extra.maxTouchPoints })
  return [result.available, result.reason, result.system, result.browser, result.suggest.join('+')]
}

test('systems and browsers are told apart from what the browser says about itself', () => {
  assert.deepEqual(Object.values(UA).map((agent) => `${voiceSystem(agent)}/${voiceBrowser(agent)}`), [
    'macos/chrome', 'macos/safari', 'macos/firefox', 'windows/edge', 'windows/firefox', 'windows/opera', 'linux/chrome',
    'ios/safari', 'ios/chrome', 'ios/other', 'android/chrome', 'android/firefox', 'android/chrome', 'android/samsung',
  ])
  // An iPad asking for desktop pages looks like a Mac, except that it can be touched.
  assert.equal(voiceSystem(UA.safariMac, 'MacIntel', 5), 'ios')
  assert.equal(voiceSystem(UA.safariMac, 'MacIntel', 0), 'macos')
  assert.deepEqual([browsersFor('ios'), browsersFor('macos'), browsersFor('android'), browsersFor('windows'), browsersFor('linux')], [['Safari'], ['Chrome', 'Safari'], ['Chrome'], ['Chrome'], ['Chrome']])
  assert.deepEqual([otherBrowsers('macos', 'chrome'), otherBrowsers('macos', 'safari'), otherBrowsers('windows', 'chrome'), otherBrowsers('ios', 'safari')], [['Safari'], ['Chrome'], [], []])
})

test('where recognition works it is used; where it does not, a browser that has it is named', () => {
  assert.deepEqual(support(UA.chromeMac, true), [true, 'ok', 'macos', 'chrome', ''])
  assert.deepEqual(support(UA.safariMac, true), [true, 'ok', 'macos', 'safari', ''])
  assert.deepEqual(support(UA.safariPhone, true), [true, 'ok', 'ios', 'safari', ''])
  assert.deepEqual(support(UA.chromeAndroid, true), [true, 'ok', 'android', 'chrome', ''])
  assert.deepEqual(support(UA.chromeLinux, true), [true, 'ok', 'linux', 'chrome', ''])
  // Edge is tried: whether it answers is only known once it has been asked.
  assert.deepEqual(support(UA.edgeWindows, true), [true, 'ok', 'windows', 'edge', ''])
  assert.deepEqual(support(UA.samsungAndroid, true), [true, 'ok', 'android', 'samsung', ''])

  assert.deepEqual(support(UA.firefoxWindows, false), [false, 'no-api', 'windows', 'firefox', 'Chrome'])
  assert.deepEqual(support(UA.firefoxMac, false), [false, 'no-api', 'macos', 'firefox', 'Chrome+Safari'])
  assert.deepEqual(support(UA.firefoxAndroid, false), [false, 'no-api', 'android', 'firefox', 'Chrome'])
  assert.deepEqual(support(UA.chromePhone, false), [false, 'no-api', 'ios', 'chrome', 'Safari'])
  assert.deepEqual(support(UA.operaWindows, true), [false, 'silent', 'windows', 'opera', 'Chrome'])
  // The only browser there is to name is the one already open: nothing is suggested.
  assert.deepEqual(support(UA.chromeAndroid, false), [false, 'no-api', 'android', 'chrome', ''])

  // Inside another app, or opened from the home screen: the same browser, opened directly.
  assert.deepEqual(support(UA.wechatPhone, false), [false, 'in-app', 'ios', 'other', 'Safari'])
  assert.deepEqual(support(UA.safariPhone, false, { standalone: true }), [false, 'in-app', 'ios', 'safari', 'Safari'])
  assert.deepEqual(support(UA.webviewAndroid, false), [false, 'in-app', 'android', 'chrome', 'Chrome'])

  // Without https or localhost no browser hands out the microphone.
  assert.deepEqual(support(UA.chromeMac, true, { secure: false }), [false, 'insecure', 'macos', 'chrome', ''])
})

test('what goes wrong while listening is told in terms the learner can act on', () => {
  assert.deepEqual(
    ['not-allowed', 'service-not-allowed', 'audio-capture', 'network', 'no-speech', 'language-not-supported', 'aborted', 'bad-grammar'].map(recognitionProblem),
    ['denied', 'service', 'no-mic', 'network', 'no-speech', 'language', null, 'failed'],
  )
  assert.deepEqual(['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError', 'AbortError', ''].map(captureProblem), ['denied', 'denied', 'no-mic', 'no-mic', 'failed', 'failed'])
  assert.deepEqual((['network', 'service', 'silent', 'language', 'denied', 'no-mic', 'no-speech', 'failed'] as const).map(recognitionBroken), [true, true, true, true, false, false, false, false])
})

test('the browser listens unless the model was chosen, and each stands in for the other', () => {
  const route = (preferred: 'browser' | 'model' | undefined, browserOk: boolean, modelOk: boolean) => chooseVoiceRoute({ preferred, browserOk, modelOk })
  assert.deepEqual([route(undefined, true, true), route('browser', true, false), route('browser', false, true), route('browser', false, false)], ['browser', 'browser', 'model', 'none'])
  assert.deepEqual([route('model', true, true), route('model', true, false), route('model', false, true), route('model', false, false)], ['model', 'browser', 'model', 'none'])
})

test('what was said is added to what is already written', () => {
  assert.equal(appendSpoken('', ' I went to the park. ', 'en'), 'I went to the park.')
  assert.equal(appendSpoken('Yesterday', 'I went to the park.', 'en'), 'Yesterday I went to the park.')
  assert.equal(appendSpoken('Yesterday ', 'I went.', 'en'), 'Yesterday I went.')
  assert.equal(appendSpoken('昨天', '我去了公园。', 'zh'), '昨天我去了公园。')
  assert.equal(appendSpoken('きのう', '公園に行きました。', 'ja-JP'), 'きのう公園に行きました。')
  assert.equal(appendSpoken('어제', '공원에 갔어요.', 'ko'), '어제 공원에 갔어요.')
  assert.equal(appendSpoken('kept', '   ', 'en'), 'kept')
})

function missedIn(sentence: string, heard: string, languageCode: string) {
  const result = compareReading(sentence, heard, languageCode)
  assert.equal(result.pieces.map((piece) => piece.text).join(''), sentence)
  assert.equal(result.missed, result.pieces.filter((piece) => piece.word && !piece.heard).length)
  return result.pieces.filter((piece) => piece.word && !piece.heard).map((piece) => piece.text)
}

test('the words of a sentence that were not heard are marked, in every learning language', () => {
  assert.deepEqual(missedIn("I think so, don't you?", 'I sink so don’t you', 'en'), ['think'])
  assert.deepEqual(missedIn('What is your favourite colour?', 'what is your favorite color', 'en'), [])
  assert.deepEqual(missedIn('She has been living here for three years.', 'she has living here three years', 'en'), ['been', 'for'])
  assert.equal(compareReading('I think so.', '', 'en').missed, 3)
  assert.equal(compareReading('I think so.', 'I think so', 'en').words, 3)

  assert.deepEqual(missedIn('¿Dónde está el baño?', 'donde esta el baño', 'es'), [])
  assert.deepEqual(missedIn('Je voudrais un café, s’il vous plaît.', "je voudrais un cafe s'il vous plait", 'fr'), [])
  assert.deepEqual(missedIn('Ich hätte gern ein Brötchen.', 'ich hatte gern ein', 'de'), ['Brötchen'])
  assert.deepEqual(missedIn('Vorrei un bicchiere d’acqua.', "vorrei un bicchiere d'acqua", 'it'), [])
  assert.deepEqual(missedIn('Você pode me ajudar, por favor?', 'você pode ajudar por favor', 'pt'), ['me'])
  assert.deepEqual(missedIn('मैं कल बाज़ार गया था।', 'मैं कल बाजार गया था', 'hi'), [])
  assert.deepEqual(missedIn('मैं कल बाज़ार गया था।', 'मैं बाजार गया', 'hi'), ['कल', 'था'])

  // Without spaces to go by, the sentence is matched character by character.
  assert.deepEqual(missedIn('我昨天去了公园。', '我昨天去了公园', 'zh'), [])
  assert.deepEqual(missedIn('我昨天去了公园。', '我去了公园', 'zh'), ['昨天'])
  assert.deepEqual(missedIn('公園に行きました。', '公園に行きました', 'ja'), [])
  assert.equal(missedIn('公園に行きました。', '行きました', 'ja').includes('公園'), true)
  // Korean recognisers space words their own way.
  assert.deepEqual(missedIn('어제 공원에 갔어요.', '어제공원에 갔어요', 'ko'), [])
  assert.deepEqual(missedIn('어제 공원에 갔어요.', '어제 갔어요', 'ko'), ['공원에'])
})

test('a turn ends after a long enough silence, and never before something was said', () => {
  const watch = createSilenceWatch(2500)
  const feed = (level: number, ms: number) => { let over = false; for (let at = 0; at < ms; at += 100) over = watch.feed(level, 100); return over }
  assert.equal(feed(0.004, 5000), false)
  assert.equal(watch.spoke, false)
  assert.equal(feed(0.12, 1000), false)
  assert.equal(feed(0.004, 1300), false)
  assert.equal(feed(0.1, 800), false)
  assert.equal(watch.pauses, 1)
  assert.equal(watch.spokenSeconds, 1.8)
  assert.equal(feed(0.004, 2400), false)
  assert.equal(feed(0.004, 100), true)

  // A noisy room raises what counts as speech.
  const noisy = createSilenceWatch(1500)
  for (let at = 0; at < 100; at += 1) noisy.feed(0.014, 100)
  assert.equal(noisy.spoke, false)
  assert.equal(noisy.feed(0.03, 100), false)
  assert.equal(noisy.spoke, false)
  noisy.feed(0.2, 100)
  assert.equal(noisy.spoke, true)

  assert.equal(pausesBetween([0, 300, 700, 2100, 2300, 4000]), 2)
  assert.equal(pausesBetween([]), 0)
})

test('a recording is sent as 16 kHz mono WAV', () => {
  const second = new Float32Array(48_000).fill(0.5)
  const down = resample(second, 48_000, VOICE_SAMPLE_RATE)
  assert.equal(down.length, VOICE_SAMPLE_RATE)
  assert.equal(Math.abs(down[100] - 0.5) < 1e-6, true)
  assert.equal(resample(down, VOICE_SAMPLE_RATE, VOICE_SAMPLE_RATE), down)
  assert.equal(resample(new Float32Array(44_100), 44_100, VOICE_SAMPLE_RATE).length, VOICE_SAMPLE_RATE)

  const wav = encodeWav(down)
  assert.equal(wav.length, 44 + VOICE_SAMPLE_RATE * 2)
  assert.equal(wavSeconds(wav), 1)
  const view = new DataView(wav.buffer)
  assert.deepEqual([view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true), view.getInt16(44, true)], [1, VOICE_SAMPLE_RATE, 16, Math.round(0.5 * 0x7fff)])
  // Samples past full scale are held at it.
  assert.deepEqual(Array.from(new Int16Array(encodeWav(new Float32Array([2, -2])).buffer.slice(44))), [0x7fff, -0x8000])

  assert.equal(Math.abs(loudness(second) - 0.5) < 1e-6, true)
  assert.equal(loudness(new Float32Array(0)), 0)
  const bytes = new Uint8Array(100_000).map((_, index) => index % 251)
  assert.deepEqual(new Uint8Array(Buffer.from(base64Of(bytes), 'base64')), bytes)
})
