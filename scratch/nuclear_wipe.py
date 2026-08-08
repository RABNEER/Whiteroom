import paramiko
import os

HOST = "66.42.90.144"
PORT = 22
USER = "root"
PASS = "=fV26h5Mu%aDH7F@"
KEY_PATH = os.path.expanduser("~/.ssh/id_ed25519")

def run():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print("Connecting to VPS...")
    try:
        if os.path.exists(KEY_PATH):
            client.connect(HOST, port=PORT, username=USER, key_filename=KEY_PATH, timeout=15)
        else:
            client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)
    except Exception:
        client.connect(HOST, port=PORT, username=USER, password=PASS, timeout=15)

    print("Executing nuclear wipe...")
    
    # Stop ALL pm2 processes that might be running the bot
    commands = [
        "pm2 stop all",
        "pm2 delete whatsapp",
        "pm2 delete whatsapp-bot",
        "rm -rf /app/apps/api/.wwebjs_auth",
        "cd /app && git pull origin 001-auth-multitenancy",
        "cd /app && pm2 start pnpm --name 'whatsapp-bot' -- run deploy:whatsapp-standalone"
    ]
    
    # Wait, the package.json has "whatsapp:bot" as the script.
    # So "pm2 start pnpm --name 'whatsapp-bot' -- run whatsapp:bot" is the correct command.
    
    commands_to_run = """
    pm2 stop all
    pm2 delete whatsapp
    pm2 delete whatsapp-bot
    rm -rf /app/apps/api/.wwebjs_auth
    cd /app && git pull origin 001-auth-multitenancy
    cd /app/apps/api && pm2 start pnpm --name "whatsapp-bot" -- run whatsapp:bot
    """
    
    stdin, stdout, stderr = client.exec_command(commands_to_run)
    print(stdout.read().decode())
    err = stderr.read().decode()
    if err:
        print("ERRORS:", err)
        
    client.close()
    print("Done!")

if __name__ == "__main__":
    run()
