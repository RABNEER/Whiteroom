import os
import sys
from dotenv import load_dotenv

# Load .env
load_dotenv("D:\\Whiteroom\\.env")

url = os.environ.get("DATABASE_URL")
print("Connecting to DB:", url)

import psycopg2
try:
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    
    # Get latest 10 whatsapp sessions
    cur.execute("""
        SELECT id, phone, verified, expires_at, created_at
        FROM whatsapp_sessions
        ORDER BY created_at DESC
        LIMIT 10;
    """)
    sessions = cur.fetchall()
    print("Latest 10 WhatsApp sessions:")
    for s in sessions:
        print(f"ID: {s[0]} | Phone: {s[1]} | Verified: {s[2]} | ExpiresAt: {s[3]} | CreatedAt: {s[4]}")
        
    cur.close()
    conn.close()
except Exception as e:
    print("Error:", e)
