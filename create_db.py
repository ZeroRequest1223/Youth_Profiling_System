#!/usr/bin/env python3
import os
import sys
import psycopg2
from psycopg2 import sql


def main():
    dbname = os.environ.get('POSTGRES_DB', 'lydo')
    user = os.environ.get('POSTGRES_USER', 'postgres')
    password = os.environ.get('POSTGRES_PASSWORD', '')
    host = os.environ.get('POSTGRES_HOST', 'localhost')
    port = os.environ.get('POSTGRES_PORT', '5432')

    try:
        conn = psycopg2.connect(dbname='postgres', user=user, password=password, host=host, port=port)
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,))
        if cur.fetchone():
            print(f"Database '{dbname}' already exists")
        else:
            cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(dbname)))
            print(f"Created database '{dbname}'")
        cur.close()
        conn.close()
    except Exception as e:
        print('Error creating database:', e)
        sys.exit(1)


if __name__ == '__main__':
    main()
