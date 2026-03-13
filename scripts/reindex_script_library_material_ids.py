from __future__ import annotations

import sqlite3
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
DB_PATH = ROOT_DIR / "runtime" / "script_library.db"
SECTION_TYPES = tuple("ABCDFGHIJKL")


def main() -> None:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        connection.execute("BEGIN")
        for section_type in SECTION_TYPES:
            rows = connection.execute(
                """
                SELECT id
                FROM script_sections
                WHERE section_type = ?
                ORDER BY global_index ASC, id ASC
                """,
                (section_type,),
            ).fetchall()

            for next_index, row in enumerate(rows, start=1):
                material_id = f"{section_type}{next_index}"
                connection.execute(
                    """
                    UPDATE script_sections
                    SET global_index = ?, material_id = ?
                    WHERE id = ?
                    """,
                    (next_index, material_id, row["id"]),
                )

            connection.execute(
                """
                INSERT INTO script_material_counters(section_type, next_index)
                VALUES (?, ?)
                ON CONFLICT(section_type) DO UPDATE SET next_index = excluded.next_index
                """,
                (section_type, len(rows) + 1),
            )

        connection.commit()
    finally:
        connection.close()

    print(f"Reindexed material IDs in {DB_PATH}")


if __name__ == "__main__":
    main()
