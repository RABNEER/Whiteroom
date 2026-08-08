import paramiko
import sys

sys.stdout.reconfigure(encoding="utf-8")

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect(
    "66.42.90.144",
    username="root",
    key_filename=r"C:\Users\LOQ\.ssh\id_ed25519",
    timeout=30,
    banner_timeout=30,
    auth_timeout=30,
)

cmds = [
    ("whiteroom-api live logs (last 60)", "pm2 logs whiteroom-api --lines 60 --nostream --raw 2>&1 | tail -n 60 || true"),
    ("whatsapp-bot live logs (last 40)", "pm2 logs whatsapp-bot --lines 40 --nostream --raw 2>&1 | tail -n 40 || true"),
    ("Any Chromium running?", "pgrep -af chromium | head -5; echo '---'; pgrep -c chrome || echo '0 chome'"),
    ("QR raw endpoint", "curl -s -m 10 http://localhost:3000/api/v1/auth/whatsapp/qr/raw 2>&1 | head -c 500"),
]
for label, cmd in cmds:
    print(f"=== {label}")
    stdin, stdout, stderr = c.exec_command(cmd, timeout=60)
    out = stdout.read().decode("utf-8", errors="ignore")
    err = stderr.read().decode("utf-8", errors="ignore")
    print(out)
    if err:
        print("[STDERR]", err)
    print("-" * 50)

c.close()