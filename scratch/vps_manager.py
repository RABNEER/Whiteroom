import paramiko
import sys

sys.stdout.reconfigure(encoding='utf-8')

HOST = "66.42.90.144"
PORT = 22
USER = "root"
PASS = "=fV26h5Mu%aDH7F@"

def check_vps_repo():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=10)

    cmds = [
        "cd /app && pwd && git status",
        "cd /app && git remote -v",
        "cd /app && git log -n 3 --oneline"
    ]
    for cmd in cmds:
        print(f"=== {cmd} ===")
        stdin, stdout, stderr = client.exec_command(cmd)
        print(stdout.read().decode('utf-8', errors='ignore'))
        print(stderr.read().decode('utf-8', errors='ignore'))

    client.close()

if __name__ == "__main__":
    check_vps_repo()
