#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = "https://jules.googleapis.com/v1alpha";

function getApiKey(): string {
  const key = process.env.JULES_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Missing JULES_API_KEY environment variable. Please set JULES_API_KEY in your environment or .env file."
    );
  }
  return key;
}

async function julesFetch(endpoint: string, options: RequestInit = {}) {
  const apiKey = getApiKey();
  const url = `${BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  
  const headers = new Headers(options.headers || {});
  headers.set("X-Goog-Api-Key", apiKey);
  headers.set("Content-Type", "application/json");

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jules API Error (${response.status} ${response.statusText}): ${errorText}`);
  }

  // Handle empty 204 or empty response
  if (response.status === 204 || response.headers.get("content-length") === "0") {
    return {};
  }

  return response.json();
}

const server = new Server(
  {
    name: "jules-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "jules_list_sources",
        description: "List all code repositories (sources) connected to your Google Jules account.",
        inputSchema: {
          type: "object",
          properties: {
            pageSize: {
              type: "number",
              description: "Maximum number of sources to return (default 50)",
            },
            pageToken: {
              type: "string",
              description: "Token for pagination",
            },
          },
        },
      },
      {
        name: "jules_create_session",
        description: "Start a new autonomous coding session/task in Google Jules for a specific repository source.",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description: "The resource name of the source repository (e.g. 'sources/github/RABNEER/Whiteroom' or exact source ID from jules_list_sources)",
            },
            prompt: {
              type: "string",
              description: "The detailed instruction/task description for Jules to execute (e.g. 'Fix all CORS and XSS vulnerabilities')",
            },
            branch: {
              type: "string",
              description: "Optional base branch name (default: main or default repo branch)",
            },
          },
          required: ["source", "prompt"],
        },
      },
      {
        name: "jules_list_sessions",
        description: "List existing sessions for a given repository source.",
        inputSchema: {
          type: "object",
          properties: {
            source: {
              type: "string",
              description: "The resource name of the source repository (e.g. 'sources/github/RABNEER/Whiteroom')",
            },
            pageSize: {
              type: "number",
              description: "Maximum number of sessions to return",
            },
          },
          required: ["source"],
        },
      },
      {
        name: "jules_get_session",
        description: "Get details and status of a specific Jules session.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "The full session resource name (e.g. 'sources/123/sessions/456')",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "jules_list_activities",
        description: "List all activities (events, plan generation, messages, code changes) within a specific session.",
        inputSchema: {
          type: "object",
          properties: {
            session: {
              type: "string",
              description: "The full session resource name (e.g. 'sources/123/sessions/456')",
            },
          },
          required: ["session"],
        },
      },
      {
        name: "jules_send_message",
        description: "Send an additional instruction or message to an existing Jules session.",
        inputSchema: {
          type: "object",
          properties: {
            session: {
              type: "string",
              description: "The full session resource name (e.g. 'sources/123/sessions/456')",
            },
            message: {
              type: "string",
              description: "The message or instruction text to send",
            },
          },
          required: ["session", "message"],
        },
      },
      {
        name: "jules_approve_plan",
        description: "Approve a pending implementation plan or blocked activity in a Jules session so execution continues.",
        inputSchema: {
          type: "object",
          properties: {
            session: {
              type: "string",
              description: "The full session resource name (e.g. 'sources/123/sessions/456')",
            },
          },
          required: ["session"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

  try {
    switch (name) {
      case "jules_list_sources": {
        const query = new URLSearchParams();
        if (args.pageSize) query.set("pageSize", String(args.pageSize));
        if (args.pageToken) query.set("pageToken", String(args.pageToken));
        const data = await julesFetch(`/sources?${query.toString()}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "jules_create_session": {
        const { source, prompt, branch } = args as { source: string; prompt: string; branch?: string };
        const cleanSource = source.startsWith("/") ? source.slice(1) : source;
        const payload: any = {
          prompt,
          sourceContext: {
            source: cleanSource,
          },
        };
        if (branch) {
          payload.sourceContext.branchContext = { baseBranch: branch };
        }
        const data = await julesFetch(`/sessions`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "jules_list_sessions": {
        const { source, pageSize } = args as { source?: string; pageSize?: number };
        const query = new URLSearchParams();
        if (pageSize) query.set("pageSize", String(pageSize));
        const data = await julesFetch(`/sessions?${query.toString()}`);
        if (source && data && Array.isArray(data.sessions)) {
          const cleanSource = source.startsWith("/") ? source.slice(1) : source;
          data.sessions = data.sessions.filter((s: any) => 
            s.sourceContext?.source === cleanSource || s.sourceContext?.source?.endsWith(cleanSource)
          );
        }
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "jules_get_session": {
        const { name: sessionName } = args as { name: string };
        const cleanName = sessionName.startsWith("/") ? sessionName.slice(1) : sessionName;
        const data = await julesFetch(`/${cleanName}`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "jules_list_activities": {
        const { session } = args as { session: string };
        const cleanSession = session.startsWith("/") ? session.slice(1) : session;
        const data = await julesFetch(`/${cleanSession}/activities`);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "jules_send_message": {
        const { session, message } = args as { session: string; message: string };
        const cleanSession = session.startsWith("/") ? session.slice(1) : session;
        const data = await julesFetch(`/${cleanSession}/activities`, {
          method: "POST",
          body: JSON.stringify({
            messageActivity: {
              text: message,
            },
          }),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      case "jules_approve_plan": {
        const { session } = args as { session: string };
        const cleanSession = session.startsWith("/") ? session.slice(1) : session;
        const data = await julesFetch(`/${cleanSession}:approvePlan`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: "text",
          text: `Error executing ${name}: ${error.message || error}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
