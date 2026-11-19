# Changelog

All notable changes to `@agentidp/mcp` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- Stdio MCP server with six tools: `lookup_agent`, `agent_status`, `verify_token`, `register_agent`, `rotate_agent_key`, `mint_token`.
- Agent private keys are written to an owner-only file and never returned by a tool.
