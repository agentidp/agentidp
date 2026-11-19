#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createAgentIdpServer } from "./index.js";

const server = createAgentIdpServer({
  apiKey: process.env.AGENTIDP_API_KEY,
  registryUrl: process.env.AGENTIDP_REGISTRY_URL || undefined,
  keyDir: process.env.AGENTIDP_KEY_DIR || undefined,
});

// stdout carries the protocol; anything for a human goes to stderr.
await server.connect(new StdioServerTransport());
console.error("AgentIDP MCP server running on stdio");
