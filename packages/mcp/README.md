# @agentidp/mcp

MCP server for the AgentIDP registry. It lets a coding agent look up and verify agent identities, register an agent, rotate its key and mint tokens, without leaving the editor.

Not yet published to npm. Until a maintainer publishes it, build it from this workspace (`pnpm install && pnpm build`) and point your client at `node /path/to/agentidp/packages/mcp/dist/cli.js` instead of `npx -y @agentidp/mcp`.

## Tools

| Tool | Needs an API key | What it does |
| --- | --- | --- |
| `lookup_agent` | no | An agent's public record: status, capabilities, owner id, verification level, verified domain or organisation |
| `agent_status` | no | Whether an agent is `active`, `revoked` or `suspended` |
| `verify_token` | no | Checks an Agent Identity Token against the registry's signing keys and returns its claims |
| `register_agent` | yes | Creates an agent. The key pair is generated on your machine |
| `rotate_agent_key` | yes | Replaces an agent's key pair, proving control of the current key |
| `mint_token` | yes | Exchanges an agent proof for a short-lived token for one audience |

Errors keep the registry's own code in front (`AID-011: …`), so a caller can branch on it.

## Where private keys go

An agent's private key is never returned by a tool, so it does not enter the model's conversation or your chat history.

- `register_agent` and `rotate_agent_key` write the private JWK to `<key dir>/<agent_id>.private.jwk.json`, readable by your user only (mode `0600`), and return the path.
- The key directory is `.agentidp` in the directory the server starts in. Change it with `AGENTIDP_KEY_DIR`. The server puts a `.gitignore` containing `*` inside it.
- `mint_token` and `rotate_agent_key` read the key from that file. Pass `private_key_path` if you keep it elsewhere.
- After a rotation the old key file is kept beside the new one with a `.replaced-<timestamp>` suffix. Delete it once you are sure the new key works.
- Only the public half is ever sent to the registry.

`mint_token` does return the minted token. It is a bearer credential that expires within 24 hours (one hour by default); use it and do not store it.

## Configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `AGENTIDP_API_KEY` | for the three write tools | Owner API key (`aidp_…`), created in the registry dashboard. Give it only the permissions the job needs: a key limited to token exchange can mint but cannot create agents or change keys |
| `AGENTIDP_REGISTRY_URL` | no | Default `https://registry.agentidp.dev` |
| `AGENTIDP_KEY_DIR` | no | Default `.agentidp` in the working directory |

Keep the API key out of files you commit. Where a client supports it, reference an environment variable instead of pasting the key.

## Client setup

The server speaks MCP over stdio: command `npx`, arguments `-y @agentidp/mcp`.

The formats below were checked against each tool's own documentation on 2026-11-19. These formats change; if one does not work, trust the tool's current docs. What could not be confirmed is marked.

### Claude Code

```bash
claude mcp add --env AGENTIDP_API_KEY=YOUR_KEY --transport stdio agentidp -- npx -y @agentidp/mcp
```

Add `--scope project` to write a shared `.mcp.json` at the project root, or `--scope user` for all your projects. The project file looks like this, with the key taken from your environment:

```json
{
  "mcpServers": {
    "agentidp": {
      "command": "npx",
      "args": ["-y", "@agentidp/mcp"],
      "env": { "AGENTIDP_API_KEY": "${AGENTIDP_API_KEY}" }
    }
  }
}
```

### Cursor

`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for all projects:

```json
{
  "mcpServers": {
    "agentidp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@agentidp/mcp"],
      "env": { "AGENTIDP_API_KEY": "${env:AGENTIDP_API_KEY}" }
    }
  }
}
```

### VS Code (GitHub Copilot)

VS Code's docs now describe two formats. The current one is `.mcp.json` at the workspace root, or `~/.copilot/mcp-config.json` for your user:

```json
{
  "mcpServers": {
    "agentidp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@agentidp/mcp"],
      "env": { "AGENTIDP_API_KEY": "${AGENTIDP_API_KEY}" }
    }
  }
}
```

The older `.vscode/mcp.json`, which the docs mark as legacy, uses a `servers` key and can prompt for the key:

```json
{
  "inputs": [
    { "id": "agentidp-key", "type": "promptString", "description": "AgentIDP API key", "password": true }
  ],
  "servers": {
    "agentidp": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@agentidp/mcp"],
      "env": { "AGENTIDP_API_KEY": "${input:agentidp-key}" }
    }
  }
}
```

### Codex CLI

Not fully confirmed: the Codex docs page had moved, and the shape below was read from a summary of it, not the page text.

```bash
codex mcp add agentidp --env AGENTIDP_API_KEY=YOUR_KEY -- npx -y @agentidp/mcp
```

Or in `~/.codex/config.toml`:

```toml
[mcp_servers.agentidp]
command = "npx"
args = ["-y", "@agentidp/mcp"]

[mcp_servers.agentidp.env]
AGENTIDP_API_KEY = "YOUR_KEY"
```

### Gemini CLI

`~/.gemini/settings.json` for your user, or `.gemini/settings.json` in the project:

```json
{
  "mcpServers": {
    "agentidp": {
      "command": "npx",
      "args": ["-y", "@agentidp/mcp"],
      "env": { "AGENTIDP_API_KEY": "$AGENTIDP_API_KEY" }
    }
  }
}
```

Gemini CLI strips variables that look like keys from the environment a server inherits, so the `env` entry is required.

### Windsurf

Not confirmed. Windsurf's MCP documentation address now redirects to Devin's documentation, which does not describe Windsurf's own config file. Most MCP clients accept the `mcpServers` shape shown for Cursor; check Windsurf's current docs for the file location.

## Use it from code

```ts
import { createAgentIdpServer } from "@agentidp/mcp";

const server = createAgentIdpServer({ apiKey: process.env.AGENTIDP_API_KEY });
```

`createAgentIdpServer` returns an `McpServer` you can connect to any transport. It takes `apiKey`, `registryUrl`, `keyDir` and an injectable `fetch`.

## Limits

- Stdio only. There is no hosted or HTTP endpoint.
- The server trusts whoever can call its tools with your API key. Scope the key.
- `private_key_path` is read from wherever the caller points. The file's contents are never returned or echoed in errors, only used to sign.
