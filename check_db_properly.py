import os
import sys

# Load .env
from dotenv import load_dotenv
load_dotenv("D:\\Whiteroom\\.env")

url = os.environ.get("DATABASE_URL")
print("Connecting to DB:", url)

import psycopg2
try:
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    
    # Get existing tables
    cur.execute("""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public';
    """)
    tables = cur.fetchall()
    print("Tables in public schema:")
    for t in tables:
        print(" -", t[0])
        
    # Get applied migrations
    try:
        cur.execute("SELECT * FROM __drizzle_migrations;")
        migrations = cur.fetchall()
        print("Applied migrations:")
        for m in migrations:
            print(" -", m)
    except Exception as e:
        print("Could not read __drizzle_migrations:", e)
        conn.rollback()
        
    cur.close()
    conn.close()
except Exception as e:
    print("Error:", e)
