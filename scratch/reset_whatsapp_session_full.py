import paramiko
import sys
import os

sys.stdout.reconfigure(encoding="utf-8")

HOST = "66.42.90.144"
PORT = 22
USER = "root"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")

# NOTE: uses sql.unsafe to keep backticks/$ out of the bash -e string
DELETE_DB = (
    "import postgres from 'postgres';"
    "const sql=postgres(process.env.DATABASE_URL,{ssl:'require',connect_timeout:10});"
    "const r=await sql.unsafe('DELETE FROM whatsapp_bot_store');"
    "console.log('deleted rows:', r.count);"
    "await sql.end();"
)

COUNT_DB = (
    "import postgres from 'postgres';"
    "const sql=postgres(process.env.DATABASE_URL,{ssl:'require',connect_timeout:10});"
    "const [r]=await sql.unsafe('SELECT COUNT(*)::int AS n FROM whatsapp_bot_store');"
    "console.log('rows remaining in whatsapp_bot_store:', r.n);"
    "await sql.end();"
)

CMDS = [
    ("PM2 status before", "pm2 status 2>&1"),
    ("Stop all services (halts 2-min DB sync + 10s reconnect)", "pm2 stop all || true"),
    ("Kill stray Chromium", "pkill -9 -f chromium || true; pkill -9 -f chrome || true"),
    (
        "Wipe whatsapp_bot_store in Postgres (bot is stopped, no re-sync)",
        "cd /app/apps/api && set -a && . /app/.env && set +a && node --input-type=module -e \""
        + DELETE_DB
        + '"',
        True,
    ),
    (
        "Verify table is empty",
        "cd /app/apps/api && set -a && . /app/.env && set +a && node --input-type=module -e \""
        + COUNT_DB
        + '"',
        True,
    ),
    ("Wipe local session folders", "rm -rf /app/apps/api/.wwebjs_auth /app/apps/api/.wwebjs_cache"),
    ("Print server env hints (non-secret)", "grep -E '^(APP_URL|PORT)=' /app/.env || true"),
    ("Restart all services", "pm2 restart all"),
    ("Wait for startup", "sleep 25"),
    ("wholesale-bot logs (last 90)", "pm2 logs whatsapp-bot --lines 90 --nostream --raw 2>&1 | tail -n 90 || true"),
    ("whiteroom-api logs (last 50)", "pm2 logs whiteroom-api --lines 50 --nostream --raw 2>&1 | tail -n 50 || true"),
    (
        "Probe QR raw endpoint",
        "PORT=$(grep -E '^PORT=' /app/.env | tail -1 | cut -d= -f2 | tr -d '\"'); PORT=${PORT:-3000}; "
        'echo "PORT=$PORT"; curl -s -m 10 http://localhost:$PORT/api/v1/auth/whatsapp/qr/raw || echo "QR probe failed"',
    ),
]


def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST} ...", flush=True)
    client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=20)
    print("Connected.\n", flush=True)

    errored = False
    for item in CMDS:
        label = item[0]
        cmd = item[1]
        critical = item[2] if len(item) > 2 else False
        print(f"=== {label}\n$ {cmd}", flush=True)
        stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
        out = stdout.read().decode("utf-8", errors="ignore")
        err = stderr.read().decode("utf-8", errors="ignore")
        rc = stdout.channel.recv_exit_status()
        if out:
            print(out)
        if err:
            print("[STDERR] " + err)
        if rc != 0:
            print(f"[WARN] exit={rc}")
            if critical:
                errored = True
                print("[ABORT] critical step failed; NOT restarting services.", flush=True)
                break
        print("-" * 60, flush=True)

    client.close()
    if errored:
        sys.exit(1)


if __name__ == "__main__":
    main()