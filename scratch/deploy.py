import paramiko
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

HOST = "66.42.90.144"
PORT = 22
USER = "root"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")
PASS = "=fV26h5Mu%aDH7F@"

DEPLOY_CMD = "cd /app && git pull origin 001-auth-multitenancy && pnpm install && pnpm build && pm2 reload all"

def deploy():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"Connecting to VPS ({USER}@{HOST})...")
    try:
        if os.path.exists(KEY_PATH):
            print(f"Using SSH key authentication: {KEY_PATH}")
            client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=15)
        else:
            print("SSH key not found, using password fallback...")
            client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
        print("Connected successfully!\n")
    except Exception as e:
        print(f"Key authentication failed ({e}), falling back to password...")
        client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

    print(f"Executing: {DEPLOY_CMD}\n")
    stdin, stdout, stderr = client.exec_command(DEPLOY_CMD)

    for line in stdout:
        print(line, end="")

    err = stderr.read().decode('utf-8', errors='ignore')
    if err:
        print("\n[STDERR / WARNINGS]:\n" + err)

    print("\nChecking PM2 status after deploy...")
    stdin, stdout, stderr = client.exec_command("pm2 status")
    print(stdout.read().decode('utf-8', errors='ignore'))

    client.close()
    print("Deployment process complete! 🚀")

if __name__ == "__main__":
    deploy()
