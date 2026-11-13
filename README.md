# Yujian · Local Language Coach

English · [简体中文](./README.zh-CN.md)

Practice conversations that can carry a thread—on your own computer, with the model you choose.

Start with your first sentence, or set up a conversation first. Yujian responds to what you said before offering corrections, definitions, or more natural phrasing. Anything remembered for later stays under your control.

![Yujian home screen](./assets/readme/en/overview.png)

## What you can do

- **Start talking immediately** — no lesson or task setup required.
- **Set up a conversation** — choose a theme, add a situation or topic, then pick a partner and opening.
- **Keep the thread moving naturally** — continue, change, or close a topic without being pulled back to an unwanted question.
- **Get lightweight corrections** — the conversation comes first, with suggestions below your message.
- **Look up and translate in context** — double-click, select, or long-press part of a reply.
- **Choose what is remembered** — nothing is saved until you approve it, and every memory can be edited, deleted, or made core.
- **Build a wordbook and review it** — keep the expressions that matter and revisit them later.
- **Continue old conversations** — reopen any conversation and carry on where you left off.
- **Search when current information matters** — optional and off by default.
- **Keep your data local** — conversations, reviews, settings, memories, and API keys stay on your computer.

## Supported languages

Yujian supports conversation practice in these 10 languages:

- English
- Spanish
- French
- Japanese
- German
- Korean
- Italian
- Chinese
- Portuguese
- Hindi

The interface is also available in 10 languages:

- Simplified Chinese
- English
- Latin American Spanish
- French
- Japanese
- German
- Korean
- Italian
- Brazilian Portuguese
- Hindi

The interface language and target language can be configured separately. Conversations use the target language, while corrections, definitions, translations, and memory content use the selected interface language.

## Requirements

You need:

- [Node.js](https://nodejs.org/) `22.13` or newer
- npm, which is included with Node.js
- An API key from OpenAI, Anthropic, Google Gemini, DeepSeek, or Moonshot/Kimi

You do not need Docker, a separate database, a global pnpm installation, a cloud server, or a domain.

> Model providers may charge for API usage. Yujian does not collect those fees.

## Download and run

### Download the ZIP

1. Download the [latest source archive](https://github.com/yuanqishen666/local-language-coach/archive/refs/heads/main.zip).
2. Extract the archive.
3. Open a terminal in the extracted folder.
4. Run:

```bash
npm start
```

### Clone with Git

```bash
git clone https://github.com/yuanqishen666/local-language-coach.git
cd local-language-coach
npm start
```

The first start installs the required packages and builds the app. This usually takes one to three minutes. Your browser opens automatically when the app is ready.

If the browser does not open, use the local address printed in the terminal. The default is:

```text
http://127.0.0.1:4174
```

Keep the terminal open while using the app. Press `Ctrl+C` to stop it.

You can also use the launcher for your operating system:

| System | Launcher |
| --- | --- |
| macOS | `start-app.command` |
| Windows | `start-app.cmd` |
| Linux | `start-app.sh` |

## First-time setup

1. Choose the interface language, language you want to practise, and your current level.
2. Open **Settings → Models & keys**.
3. Choose a provider and model.
4. Enter the API key.
5. Test the connection, then save it.
6. Return to the home page and choose an open conversation or a conversation setting.

The API key stays on your computer. It is not shown in conversations or diagnostic logs.

![Model and API key settings](./assets/readme/en/model-settings.png)

## Two ways to start

### Open conversation

Choose “Start a conversation” on the home page and say the first thing that comes to mind. There is no preset task or fixed path to follow.

### Conversation setting

Choose a theme and optionally add a situation or topic. Yujian creates a few possible partners and openings for you to choose from.

The setting decides how the conversation starts, not where it has to go.

![Conversation setting](./assets/readme/en/scene-builder.png)

## Conversation, corrections, and memory

Replies address the current thread first. When a correction is useful, it stays below your message instead of taking over the conversation.

If something may be useful in a later conversation, Yujian asks before saving it. Unapproved details do not enter memory. Saved items can be reviewed, edited, deleted, or made core at any time.

![Conversation with lightweight corrections and controlled memory](./assets/readme/en/conversation.png)

![Memories](./assets/readme/en/memories.png)

## Word lookup and review

Double-click, select, or long-press unfamiliar text in your partner's message to look it up in context. A word enters your word list only when you save it.

The review page schedules practice from the words you have kept. Removing a word also removes its review schedule.

## Web search

Web search is off by default. Turn it on under **Settings → Web**.

When enabled, Yujian searches only when a reply depends on current information, such as a team roster, recent event, opening status, weather, or current price. Everyday conversation and language corrections do not trigger a search.

If you share a URL, post, account, or platform location, Yujian checks that location first. This permission applies only to the current turn.

## Supported providers

| Provider | Required key |
| --- | --- |
| OpenAI | OpenAI API key |
| Anthropic | Anthropic API key |
| Google Gemini | Google AI API key |
| DeepSeek | DeepSeek API key |
| Moonshot / Kimi | Moonshot API key |

Yujian connects only to official provider APIs. A model must pass multi-turn conversation, structured-response, and web-search checks before it can be saved as an available model.

The selected provider handles both the conversation and any search required for that turn. There is no separate background search model.

## Local data

Runtime data is stored in the project's `data/` folder:

```text
data/
├── app.db
├── config.json
├── secrets.json
└── logs/
```

- `app.db` stores conversations, saved words, reviews, and memories.
- `config.json` stores regular settings.
- `secrets.json` stores API keys.
- `logs/` contains redacted startup diagnostics.

Do not commit the `data/` folder to a public repository.

Yujian includes no telemetry. Only the currently selected provider receives the content needed to generate the current reply.

## Use it from your phone — no server required

Yujian normally accepts connections only from the computer running it. When you are away from home, its built-in protected Quick Tunnel can create a temporary HTTPS address for your phone. There is no server to rent and no Cloudflare account or domain to configure.

1. Start Yujian on your computer and leave that terminal running:

```bash
npm start
```

2. Open a second terminal in the same folder:

```bash
npm run app -- remote start
```

3. Enter the email address allowed to connect. The first run prepares the tunnel program automatically.
4. Open the displayed `https://...trycloudflare.com` address on your phone.
5. Enter the allowed email address and the one-time code sent to that inbox.

Check the current address or close it with:

```bash
npm run app -- remote status
npm run app -- remote stop
```

This uses Cloudflare's [free Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). The address changes whenever a new tunnel starts and has no uptime guarantee. Your computer, Yujian, and the tunnel process must remain running. Remote traffic passes through Cloudflare, while the API keys and local database remain on your computer. Your model provider may still charge for model usage.

## Troubleshooting

### `node` or `npm` is not found

Install Node.js from [nodejs.org](https://nodejs.org/), then reopen the terminal.

### The app does not start

Run the full diagnostic check:

```bash
npm run doctor -- --verbose
```

The check does not call a model or print API keys.

### The browser does not open

Copy the local address shown in the terminal and open it manually.

### A model test fails

Check the API key, account balance, model name, and network connection. Keys from different providers are not interchangeable.

### Updating Yujian

Pull or download the latest code, then run `npm start` again. The launcher checks the dependencies and rebuilds the app when needed. Existing practice data is kept.

## Current scope

- Text conversations only
- No speech recognition, pronunciation scoring, or live voice calls yet
- A supported provider API key is required
- Designed primarily for personal, local use

## Development

```bash
npm run dev
npm run typecheck
npm run build
```

Main directories:

```text
src/        Web interface
server/     Local service and provider adapters
shared/     Shared definitions
cli/        Command-line tools
tests/      Automated tests
```

## Contributing

Feature ideas and reproducible bugs are welcome in [GitHub Issues](https://github.com/yuanqishen666/local-language-coach/issues).

When reporting a problem, include your operating system, Node.js version, provider and model name, steps to reproduce, and relevant output from `npm run doctor -- --verbose`. Never include an API key.

## License

[MIT](./LICENSE)
