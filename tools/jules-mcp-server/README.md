# Jules MCP Server (`jules-mcp-server`)

A complete Model Context Protocol (MCP) server that connects your AI coding assistants (Claude Desktop, Cursor, Google Antigravity, etc.) directly to the **Google Jules Autonomous AI Coding REST API (`https://jules.googleapis.com/v1alpha`)**.

## 🛠️ Tools Exposed

1. **`jules_list_sources`**: List all code repositories (sources) connected to your Jules account.
2. **`jules_create_session`**: Start a new autonomous coding session/task in Google Jules for a specific repository.
3. **`jules_list_sessions`**: List existing sessions for a given repository source.
4. **`jules_get_session`**: Get details and status of a specific Jules session.
5. **`jules_list_activities`**: List all activities (events, plan generation, messages, code changes) within a specific session.
6. **`jules_send_message`**: Send an additional instruction or message to an existing Jules session.
7. **`jules_approve_plan`**: Approve a pending implementation plan or blocked activity in a Jules session so execution continues automatically.

---

## 🚀 Setup & Installation

### 1. Install Dependencies & Build
Open a terminal inside this directory (`d:\Whiteroom\tools\jules-mcp-server`):
```bash
npm install
npm run build
```

### 2. Configure API Key (.env)
1. Get your API key from [https://jules.google.com/settings](https://jules.google.com/settings).
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Add your `JULES_API_KEY=your_key_here` to `.env`.

---

## ⚙️ How to Add to Your MCP Configuration

Add the following to your `claude_desktop_config.json`, Cursor configuration, or Antigravity IDE MCP config:

```json
{
  "mcpServers": {
    "jules": {
      "command": "node",
      "args": [
        "d:/Whiteroom/tools/jules-mcp-server/dist/index.js"
      ],
      "env": {
        "JULES_API_KEY": "your_api_key_here"
      }
    }
  }
}
```
