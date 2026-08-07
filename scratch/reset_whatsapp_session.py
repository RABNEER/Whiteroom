import paramiko
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

HOST = "66.42.90.144"
PORT = 22
USER = "root"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")

def reset_whatsapp():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"Connecting to VPS ({USER}@{HOST})...")
    client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=15)
    print("Connected successfully!\n")

    cmds = [
        "pm2 stop all || true",
        "pkill -9 -f chromium || true",
        "pkill -9 -f chrome || true",
        "rm -rf /app/apps/api/.wwebjs_auth /app/apps/api/.wwebjs_cache",
        "cd /app && git pull origin 001-auth-multitenancy && pnpm install && pnpm build",
        "pm2 restart all",
        "sleep 5",
        "pm2 logs whatsapp-bot --lines 60 --nostream --raw"
    ]

    for cmd in cmds:
        print(f"=== Executing: {cmd} ===")
        stdin, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode('utf-8', errors='ignore')
        err = stderr.read().decode('utf-8', errors='ignore')
        if out:
            print(out)
        if err:
            print("[STDERR]: " + err)
        print("-" * 50)

    client.close()

if __name__ == "__main__":
    reset_whatsapp()
