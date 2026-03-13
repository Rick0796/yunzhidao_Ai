from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.script_library import (
    load_script_payload,
    render_script_document_text,
    resolve_script_library_db_path,
    upsert_script_document,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Import structured script JSON files into the local script library.")
    parser.add_argument("paths", nargs="+", help="One or more JSON files to import")
    parser.add_argument("--db", dest="db_path", default="", help="Optional SQLite database path")
    args = parser.parse_args()

    db_path = Path(args.db_path).resolve() if args.db_path else resolve_script_library_db_path()
    imported = 0

    for raw_path in args.paths:
        path = Path(raw_path).resolve()
        payload = load_script_payload(path)
        document = upsert_script_document(payload, db_path)
        imported += 1
        print(f"Imported {document['originalId']} from {path}")
        print(render_script_document_text(document))
        print("-" * 60)

    print(f"Done. Imported {imported} file(s) into {db_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
