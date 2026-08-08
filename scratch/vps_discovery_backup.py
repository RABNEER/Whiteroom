import paramiko
import sys
import os

sys.stdout.reconfigure(encoding="utf-8")

HOST = "66.42.90.144"
PORT = 22
USER = "root"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")

CMDS = [
    ("PM2 status (names, ids, restarts, cwd)", "pm2 status"),
    (
        "PM2 dump: exact start command for each proc (jlist -> cwd/args/script)",
        "node -e \"const j=require('/root/.pm2/dump.pm2');const p=(j||{}).pm2||[];p.forEach(m=>{console.log('----',m.name,'(id '+m.pm_id+')');console.log('  cwd :',m.pm2_env&&m.pm2_env.pm_cwd);console.log('  exec:',m.pm2_env&&(m.pm2_env.exec_interpreter||'')+' '+(m.pm2_env&&m.pm2_env.PM2_EXEC_PATH?'':'')+(m.pm2_env&&m.pm2_env.exec_mode||''));console.log('  args:',JSON.stringify(m.pm2_env&&m.pm2_env.args||[]));}):console.log('dump parse failed')\"",
    ),
    ("Save/backup /app/.env to /root (pre-wipe safety)", "mkdir -p /root/whiteroom-backups && cp -p /app/.env /root/whiteroom-backups/.env.bak && sha256sum /app/.env /root/whiteroom-backups/.env.bak"),
    ("App dir layout", "ls -la /app && echo '---' && ls /app/apps 2>/dev/null && echo '---apps/api---' && ls /app/apps/api | head -30"),
    ("Git state of /app", "cd /app && git rev-parse --abbrev-ref HEAD 2>&1 && git log --oneline -3 2>&1 && git remote -v"),
    ("Node/pnpm/pm2 versions", "node --version; pnpm --version 2>/dev/null || echo 'pnpm: none'; pm2 --version"),
    ("PM2 startup script registered?", "pm2 startup 2>&1 | head -5"),
    ("Ports listening", "ss -tlnp | grep -E 'node|:3000' | head -10"),
]

def main():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to {USER}@{HOST} ...", flush=True)
    client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=30, banner_timeout=60, auth_timeout=30)
    print("Connected.\n", flush=True)

    for label, cmd in CMDS:
        print(f"=== {label}\n$ {cmd}", flush=True)
        stdin, stdout, stderr = client.exec_command(cmd, timeout=90)
        out = stdout.read().decode("utf-8", errors="ignore")
        err = stderr.read().decode("utf-8", errors="ignore")
        rc = stdout.channel.recv_exit_status()
        if out:
            print(out)
        if err:
            print("[STDERR] " + err)
        if rc != 0:
            print(f"[WARN] exit={rc}")
        print("-" * 60, flush=True)

    client.close()
    print("\nDone. .env backup created on VPS at /root/whiteroom-backups/.env.bak-*", flush=True)

if __name__ == "__main__":
    main()