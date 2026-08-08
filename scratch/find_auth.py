import paramiko
import sys
import os

HOST = "66.42.90.144"
PORT = 22
USER = "root"
PASS = "=fV26h5Mu%aDH7F@"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    if os.path.exists(KEY_PATH):
        client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=15)
    else:
        client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
except Exception:
    client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

stdin, stdout, stderr = client.exec_command("find / -name .wwebjs_auth 2>/dev/null")
print("Found auth dirs at:")
print(stdout.read().decode())
client.close()
