import paramiko
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

HOST = "66.42.90.144"
PORT = 22
USER = "root"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")

def get_logs():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=10)

    # --nostream ensures PM2 prints logs and exits cleanly
    stdin, stdout, stderr = client.exec_command("pm2 logs whatsapp-bot --lines 60 --nostream --raw")
    print("=== WHATSAPP BOT LOGS & QR CODE ===")
    out = stdout.read().decode('utf-8', errors='ignore')
    print(out)
    client.close()

if __name__ == "__main__":
    get_logs()
