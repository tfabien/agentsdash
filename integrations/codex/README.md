# Codex and ChatGPT Work integration

Requires Node.js 18+ and a running standup-bot hub on `127.0.0.1:8765`.

1. Check out this branch locally.
2. In the project you want to monitor, create or merge the following hook entries into `.codex/hooks.json`. Replace `C:/path/to/standup-bot` with the checkout's absolute path. Use forward slashes on Windows.
3. Open a local Codex or local-only Work session for that project. Trust the project configuration and review the five hooks in Settings → Hooks, or with `/hooks` in the CLI.
4. Submit a prompt. The tile should show Working and then Your turn when the turn ends.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/path/to/standup-bot/integrations/codex/send-event.mjs\"",
            "timeout": 3
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/path/to/standup-bot/integrations/codex/send-event.mjs\"",
            "timeout": 3
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/path/to/standup-bot/integrations/codex/send-event.mjs\"",
            "timeout": 3
          }
        ]
      }
    ],
    "Interrupt": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/path/to/standup-bot/integrations/codex/send-event.mjs\"",
            "timeout": 3
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"C:/path/to/standup-bot/integrations/codex/send-event.mjs\"",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

The script sends lead status and a project label. It does not forward prompt text, replies, tool arguments, or full paths. It uses the hub's four-character session identifiers, so collisions are possible. If the hub is unavailable, the hook exits quietly. Cloud-orchestrated Work threads do not run local command hooks.
