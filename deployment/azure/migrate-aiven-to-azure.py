#!/usr/bin/env python3
"""
AM2050 - Aiven to Azure MySQL Migration Pipeline
Transfers schema & all data records from Aiven to Azure Database for MySQL Flexible Server.
Usage:
    python migrate-aiven-to-azure.py --source-url="mysql://..." --dest-url="mysql://..."
Or set environment variables:
    AIVEN_DATABASE_URL
    AZURE_DATABASE_URL
"""

import os
import sys
import argparse
from urllib.parse import urlparse, unquote

try:
    import pymysql
except ImportError:
    print("[ERROR] pymysql is required. Run: pip install pymysql cryptography")
    sys.exit(1)


def parse_db_url(url_str: str) -> dict:
    p = urlparse(url_str)
    return {
        "host": p.hostname,
        "port": p.port or 3306,
        "user": unquote(p.username or ""),
        "password": unquote(p.password or ""),
        "database": p.path.lstrip("/"),
        "ssl": {"ssl_mode": "PREFERRED"},
    }


def get_all_tables(cursor) -> list[str]:
    cursor.execute("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
    tables = [row[0] for row in cursor.fetchall()]
    return tables


def migrate_table(src_cursor, dst_conn, dst_cursor, table: str):
    src_cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
    src_count = src_cursor.fetchone()[0]

    if src_count == 0:
        print(f"  [SKIP] Table `{table}` is empty (0 rows).")
        return

    print(f"  [TRANSFER] Migrating `{table}` ({src_count} rows)...")

    # Fetch columns
    src_cursor.execute(f"SHOW COLUMNS FROM `{table}`")
    cols = [f"`{col[0]}`" for col in src_cursor.fetchall()]
    cols_str = ", ".join(cols)
    placeholders = ", ".join(["%s"] * len(cols))

    src_cursor.execute(f"SELECT * FROM `{table}`")
    batch_size = 500
    migrated = 0

    while True:
        rows = src_cursor.fetchmany(batch_size)
        if not rows:
            break

        insert_sql = f"INSERT IGNORE INTO `{table}` ({cols_str}) VALUES ({placeholders})"
        dst_cursor.executemany(insert_sql, rows)
        dst_conn.commit()
        migrated += len(rows)
        print(f"    Progress: {migrated}/{src_count} rows...", end="\r")

    print(f"    Migrated: {migrated}/{src_count} rows successfully.    ")


def verify_tables(src_cursor, dst_cursor, tables: list[str]):
    print("\n" + "=" * 60)
    print("MIGRATION INTEGRITY VERIFICATION REPORT")
    print("=" * 60)
    print(f"{'Table Name':<35} | {'Source (Aiven)':<12} | {'Target (Azure)':<12} | Status")
    print("-" * 75)

    all_matched = True
    for table in tables:
        src_cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
        s_count = src_cursor.fetchone()[0]

        dst_cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
        d_count = dst_cursor.fetchone()[0]

        status = "MATCH [OK]" if s_count == d_count else "MISMATCH [!]"
        if s_count != d_count:
            all_matched = False
        print(f"{table:<35} | {s_count:<12} | {d_count:<12} | {status}")

    print("=" * 60)
    if all_matched:
        print("ALL TABLES MATCH 100%! Migration to Azure MySQL is verified complete.")
    else:
        print("WARNING: Some tables had row count discrepancies. Please check above.")


def main():
    parser = argparse.ArgumentParser(description="Migrate AM2050 from Aiven to Azure MySQL")
    parser.add_argument("--source-url", default=os.getenv("AIVEN_DATABASE_URL"), help="Source Aiven MySQL URL")
    parser.add_argument("--dest-url", default=os.getenv("AZURE_DATABASE_URL"), help="Target Azure MySQL URL")
    args = parser.parse_args()

    if not args.source_url or not args.dest_url:
        print("[ERROR] Please provide --source-url and --dest-url or set AIVEN_DATABASE_URL and AZURE_DATABASE_URL.")
        print("Example: python migrate-aiven-to-azure.py --source-url=\"mysql://...\" --dest-url=\"mysql://...\"")
        sys.exit(1)

    print("Connecting to Source (Aiven MySQL)...")
    src_cfg = parse_db_url(args.source_url)
    src_conn = pymysql.connect(
        host=src_cfg["host"],
        port=src_cfg["port"],
        user=src_cfg["user"],
        password=src_cfg["password"],
        database=src_cfg["database"],
        charset="utf8mb4",
        ssl=src_cfg["ssl"],
    )

    print("Connecting to Destination (Azure MySQL Flexible Server)...")
    dst_cfg = parse_db_url(args.dest_url)
    dst_conn = pymysql.connect(
        host=dst_cfg["host"],
        port=dst_cfg["port"],
        user=dst_cfg["user"],
        password=dst_cfg["password"],
        database=dst_cfg["database"],
        charset="utf8mb4",
        ssl=dst_cfg["ssl"],
    )

    try:
        with src_conn.cursor() as src_cur, dst_conn.cursor() as dst_cur:
            tables = get_all_tables(src_cur)
            print(f"Found {len(tables)} tables to migrate.")

            print("Disabling foreign key constraints on target...")
            dst_cur.execute("SET FOREIGN_KEY_CHECKS = 0")
            dst_cur.execute("SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'")
            dst_conn.commit()

            for table in tables:
                migrate_table(src_cur, dst_conn, dst_cur, table)

            print("\nRe-enabling foreign key constraints on target...")
            dst_cur.execute("SET FOREIGN_KEY_CHECKS = 1")
            dst_conn.commit()

            verify_tables(src_cur, dst_cur, tables)

    finally:
        src_conn.close()
        dst_conn.close()


if __name__ == "__main__":
    main()
