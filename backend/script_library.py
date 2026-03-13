from __future__ import annotations

import json
import os
import re
import sqlite3
import tempfile
import time
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPT_LIBRARY_DATA_DIR = ROOT_DIR / "data" / "script_library"
SECTION_KEY_PATTERN = re.compile(r"^([A-Z]+)(\d+)?$")
SECTION_LABELS = {
    "A": "爆皮",
    "B": "钩子",
    "C": "筛选/指令",
    "D": "铺垫",
    "F": "趋势判断",
    "G": "旧逻辑/过去对比",
    "H": "现实案例/权威佐证",
    "I": "放大焦虑",
    "J": "解法/新身份",
    "K": "产品承接",
    "L": "收口CTA",
}


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def resolve_script_library_db_path() -> Path:
    if os.getenv("VERCEL"):
        runtime_dir = Path(tempfile.gettempdir()) / "ai-copy-workbench"
    else:
        runtime_dir = ROOT_DIR / "runtime"
    runtime_dir.mkdir(parents=True, exist_ok=True)
    return runtime_dir / "script_library.db"


def connect_script_library(db_path: Path | None = None) -> sqlite3.Connection:
    target = db_path or resolve_script_library_db_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(target)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, definition: str) -> None:
    existing = {
        str(row["name"])
        for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    }
    if column_name in existing:
        return
    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def parse_material_index(section_type: str, raw_key: str, fallback: int | None) -> int | None:
    if fallback is not None:
        return int(fallback)
    match = SECTION_KEY_PATTERN.match(str(raw_key or "").strip())
    if not match or match.group(1) != section_type:
        return None
    return int(match.group(2)) if match.group(2) else 1


def allocate_material_index(connection: sqlite3.Connection, section_type: str) -> int:
    row = connection.execute(
        "SELECT next_index FROM script_material_counters WHERE section_type = ?",
        (section_type,),
    ).fetchone()
    if row is None:
        max_row = connection.execute(
            "SELECT MAX(global_index) AS max_index FROM script_sections WHERE section_type = ?",
            (section_type,),
        ).fetchone()
        next_index = int(max_row["max_index"] or 0) + 1
    else:
        next_index = int(row["next_index"])

    connection.execute(
        """
        INSERT INTO script_material_counters(section_type, next_index)
        VALUES (?, ?)
        ON CONFLICT(section_type) DO UPDATE SET next_index = excluded.next_index
        """,
        (section_type, next_index + 1),
    )
    return next_index


def normalize_section_key(section_key: str) -> tuple[str, int | None]:
    match = SECTION_KEY_PATTERN.match(section_key)
    if not match:
        raise ValueError(f"invalid section key: {section_key}")
    section_type = match.group(1)
    section_index = int(match.group(2)) if match.group(2) else None
    return section_type, section_index


def normalize_sections(raw_sections: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_sections, list):
        raise ValueError("sections must be a list")

    normalized: list[dict[str, Any]] = []
    for fallback_order, item in enumerate(raw_sections):
        if not isinstance(item, dict):
            raise ValueError("each section must be an object")
        section_key = str(item.get("key") or "").strip()
        content = str(item.get("content") or "").strip()
        if not section_key:
            raise ValueError("section key is required")
        if not content:
            continue
        section_type, section_index = normalize_section_key(section_key)
        try:
            order_index = int(item.get("orderIndex", fallback_order))
        except (TypeError, ValueError):
            order_index = fallback_order
        normalized.append(
            {
                "key": section_key,
                "type": section_type,
                "index": section_index,
                "orderIndex": order_index,
                "content": content,
            }
        )

    if not normalized:
        raise ValueError("at least one non-empty section is required")

    normalized.sort(key=lambda item: (item["orderIndex"], item["key"]))
    return normalized


def normalize_script_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")

    original_id = str(payload.get("originalId") or "").strip()
    if not original_id:
        raise ValueError("originalId is required")

    return {
        "originalId": original_id,
        "theme": str(payload.get("theme") or "").strip(),
        "primaryDirection": str(payload.get("primaryDirection") or "").strip(),
        "secondaryDirection": str(payload.get("secondaryDirection") or "").strip(),
        "audience": str(payload.get("audience") or "").strip(),
        "sourceText": str(payload.get("sourceText") or "").strip(),
        "sections": normalize_sections(payload.get("sections")),
    }


def _upsert_normalized_document(
    connection: sqlite3.Connection,
    normalized: dict[str, Any],
    *,
    timestamp: str,
) -> None:
    existing = connection.execute(
        "SELECT id FROM script_documents WHERE original_id = ?",
        (normalized["originalId"],),
    ).fetchone()

    existing_sections: dict[str, tuple[str, int]] = {}
    if existing is not None:
        rows = connection.execute(
            """
            SELECT source_key, section_key, material_id, global_index
            FROM script_sections
            WHERE document_id = ?
            """,
            (existing["id"],),
        ).fetchall()
        existing_sections = {
            str(row["source_key"] or row["section_key"]): (
                str(row["material_id"] or row["section_key"]),
                int(
                    row["global_index"]
                    or parse_material_index(
                        str(row["material_id"] or row["section_key"])[0],
                        str(row["material_id"] or row["section_key"]),
                        None,
                    )
                    or 1
                ),
            )
            for row in rows
        }

    if existing is None:
        cursor = connection.execute(
            """
            INSERT INTO script_documents (
                original_id, theme, primary_direction, secondary_direction, audience,
                source_text, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                normalized["originalId"],
                normalized["theme"],
                normalized["primaryDirection"],
                normalized["secondaryDirection"],
                normalized["audience"],
                normalized["sourceText"],
                timestamp,
                timestamp,
            ),
        )
        document_id = int(cursor.lastrowid)
    else:
        document_id = int(existing["id"])
        connection.execute(
            """
            UPDATE script_documents
            SET theme = ?, primary_direction = ?, secondary_direction = ?, audience = ?,
                source_text = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                normalized["theme"],
                normalized["primaryDirection"],
                normalized["secondaryDirection"],
                normalized["audience"],
                normalized["sourceText"],
                timestamp,
                document_id,
            ),
        )
        connection.execute("DELETE FROM script_sections WHERE document_id = ?", (document_id,))

    prepared_sections: list[tuple[Any, ...]] = []
    for section in normalized["sections"]:
        if section["key"] in existing_sections:
            material_id, global_index = existing_sections[section["key"]]
        else:
            global_index = allocate_material_index(connection, section["type"])
            material_id = f"{section['type']}{global_index}"

        prepared_sections.append(
            (
                document_id,
                section["orderIndex"],
                section["key"],
                section["key"],
                material_id,
                section["type"],
                section["index"],
                global_index,
                section["content"],
                timestamp,
            )
        )

    connection.executemany(
        """
        INSERT INTO script_sections (
            document_id, order_index, section_key, source_key, material_id,
            section_type, section_index, global_index, content, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        prepared_sections,
    )


def _seed_script_library_from_data_files(connection: sqlite3.Connection) -> None:
    if not SCRIPT_LIBRARY_DATA_DIR.exists():
        return

    for json_path in sorted(SCRIPT_LIBRARY_DATA_DIR.glob("*.json")):
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        normalized = normalize_script_payload(payload)
        _upsert_normalized_document(connection, normalized, timestamp=now_text())


def init_script_library(db_path: Path | None = None) -> Path:
    target = db_path or resolve_script_library_db_path()
    with connect_script_library(target) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS script_documents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                original_id TEXT NOT NULL UNIQUE,
                theme TEXT NOT NULL DEFAULT '',
                primary_direction TEXT NOT NULL DEFAULT '',
                secondary_direction TEXT NOT NULL DEFAULT '',
                audience TEXT NOT NULL DEFAULT '',
                source_text TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS script_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL,
                order_index INTEGER NOT NULL,
                section_key TEXT NOT NULL,
                section_type TEXT NOT NULL,
                section_index INTEGER,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(document_id) REFERENCES script_documents(id) ON DELETE CASCADE,
                UNIQUE(document_id, section_key)
            );

            CREATE INDEX IF NOT EXISTS idx_script_sections_document_order
            ON script_sections(document_id, order_index, id);

            CREATE TABLE IF NOT EXISTS script_material_counters (
                section_type TEXT PRIMARY KEY,
                next_index INTEGER NOT NULL
            );
            """
        )
        ensure_column(connection, "script_sections", "source_key", "TEXT NOT NULL DEFAULT ''")
        ensure_column(connection, "script_sections", "material_id", "TEXT")
        ensure_column(connection, "script_sections", "global_index", "INTEGER")
        connection.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_script_sections_material_id
            ON script_sections(material_id)
            """
        )
        connection.execute(
            """
            UPDATE script_sections
            SET source_key = section_key
            WHERE source_key = ''
            """
        )

        count_row = connection.execute(
            "SELECT COUNT(*) AS count FROM script_documents"
        ).fetchone()
        if int(count_row["count"] or 0) == 0:
            _seed_script_library_from_data_files(connection)

        rows = connection.execute(
            """
            SELECT id, section_key, source_key, section_type, section_index, material_id, global_index
            FROM script_sections
            WHERE material_id IS NULL OR material_id = '' OR global_index IS NULL
            """
        ).fetchall()
        for row in rows:
            source_key = str(row["source_key"] or row["section_key"] or "").strip()
            global_index = parse_material_index(str(row["section_type"]), source_key, row["global_index"])
            if global_index is None:
                global_index = allocate_material_index(connection, str(row["section_type"]))
            material_id = f"{row['section_type']}{global_index}"
            connection.execute(
                """
                UPDATE script_sections
                SET source_key = ?, material_id = ?, global_index = ?
                WHERE id = ?
                """,
                (source_key, material_id, global_index, row["id"]),
            )

        connection.commit()

    return target


def fetch_script_document(original_id: str, db_path: Path | None = None) -> dict[str, Any] | None:
    target = init_script_library(db_path)
    with connect_script_library(target) as connection:
        row = connection.execute(
            """
            SELECT id, original_id, theme, primary_direction, secondary_direction, audience,
                   source_text, created_at, updated_at
            FROM script_documents
            WHERE original_id = ?
            """,
            (original_id,),
        ).fetchone()
        if row is None:
            return None

        sections = connection.execute(
            """
            SELECT order_index, section_key, source_key, material_id, global_index,
                   section_type, section_index, content
            FROM script_sections
            WHERE document_id = ?
            ORDER BY order_index ASC, id ASC
            """,
            (row["id"],),
        ).fetchall()

    return {
        "id": row["id"],
        "originalId": row["original_id"],
        "theme": row["theme"],
        "primaryDirection": row["primary_direction"],
        "secondaryDirection": row["secondary_direction"],
        "audience": row["audience"],
        "sourceText": row["source_text"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "sections": [
            {
                "key": section["material_id"] or section["section_key"],
                "materialId": section["material_id"] or section["section_key"],
                "sourceKey": section["source_key"] or section["section_key"],
                "type": section["section_type"],
                "index": section["global_index"] if section["global_index"] is not None else section["section_index"],
                "sourceIndex": section["section_index"],
                "label": SECTION_LABELS.get(section["section_type"], section["section_type"]),
                "orderIndex": section["order_index"],
                "sequenceNo": int(section["order_index"]) + 1,
                "content": section["content"],
            }
            for section in sections
        ],
    }


def list_script_documents(db_path: Path | None = None) -> list[dict[str, Any]]:
    target = init_script_library(db_path)
    with connect_script_library(target) as connection:
        rows = connection.execute(
            """
            SELECT d.original_id, d.theme, d.primary_direction, d.secondary_direction, d.audience,
                   d.created_at, d.updated_at, COUNT(s.id) AS section_count
            FROM script_documents d
            LEFT JOIN script_sections s ON s.document_id = d.id
            GROUP BY d.id
            ORDER BY d.id ASC
            """
        ).fetchall()

    return [
        {
            "originalId": row["original_id"],
            "theme": row["theme"],
            "primaryDirection": row["primary_direction"],
            "secondaryDirection": row["secondary_direction"],
            "audience": row["audience"],
            "sectionCount": row["section_count"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def list_script_sections(
    db_path: Path | None = None,
    *,
    primary_direction: str = "",
    secondary_direction: str = "",
    section_type: str = "",
    limit: int = 300,
) -> list[dict[str, Any]]:
    target = init_script_library(db_path)
    clauses: list[str] = []
    params: list[Any] = []

    normalized_primary = str(primary_direction or "").strip()
    normalized_secondary = str(secondary_direction or "").strip()
    normalized_section_type = str(section_type or "").strip().upper()

    if normalized_primary:
        clauses.append("d.primary_direction = ?")
        params.append(normalized_primary)
    if normalized_secondary:
        clauses.append("d.secondary_direction = ?")
        params.append(normalized_secondary)
    if normalized_section_type:
        clauses.append("s.section_type = ?")
        params.append(normalized_section_type)

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    row_limit = max(1, min(int(limit or 300), 1000))

    with connect_script_library(target) as connection:
        rows = connection.execute(
            f"""
            SELECT
                d.original_id,
                d.theme,
                d.primary_direction,
                d.secondary_direction,
                d.audience,
                s.order_index,
                s.section_key,
                s.source_key,
                s.material_id,
                s.global_index,
                s.section_type,
                s.section_index,
                s.content
            FROM script_sections s
            JOIN script_documents d ON d.id = s.document_id
            {where_clause}
            ORDER BY s.section_type ASC, s.global_index ASC, s.id ASC
            LIMIT ?
            """,
            (*params, row_limit),
        ).fetchall()

    return [
        {
            "originalId": row["original_id"],
            "theme": row["theme"],
            "primaryDirection": row["primary_direction"],
            "secondaryDirection": row["secondary_direction"],
            "audience": row["audience"],
            "materialId": row["material_id"] or row["section_key"],
            "sourceKey": row["source_key"] or row["section_key"],
            "type": row["section_type"],
            "index": row["global_index"] if row["global_index"] is not None else row["section_index"],
            "sourceIndex": row["section_index"],
            "label": SECTION_LABELS.get(row["section_type"], row["section_type"]),
            "orderIndex": row["order_index"],
            "content": row["content"],
        }
        for row in rows
    ]


def count_script_documents(db_path: Path | None = None) -> int:
    target = init_script_library(db_path)
    with connect_script_library(target) as connection:
        row = connection.execute("SELECT COUNT(*) AS count FROM script_documents").fetchone()
    return int(row["count"] if row else 0)


def upsert_script_document(payload: dict[str, Any], db_path: Path | None = None) -> dict[str, Any]:
    normalized = normalize_script_payload(payload)
    target = init_script_library(db_path)

    with connect_script_library(target) as connection:
        _upsert_normalized_document(connection, normalized, timestamp=now_text())
        connection.commit()

    stored = fetch_script_document(normalized["originalId"], target)
    if stored is None:
        raise RuntimeError("stored document could not be reloaded")
    return stored


def render_script_document_text(document: dict[str, Any]) -> str:
    lines = [
        f"原文编号：{document.get('originalId', '')}",
        f"主题：{document.get('theme', '')}",
        f"一级方向：{document.get('primaryDirection', '')}",
        f"二级方向：{document.get('secondaryDirection', '')}",
        f"人群：{document.get('audience', '')}",
        "",
    ]

    for section in document.get("sections", []):
        label = section.get("label") or SECTION_LABELS.get(section.get("type", ""), section.get("type", ""))
        sequence_no = section.get("sequenceNo")
        prefix = f"[{int(sequence_no):02d}] " if isinstance(sequence_no, int) else ""
        material_id = str(section.get("materialId") or section.get("key") or "").strip()
        source_key = str(section.get("sourceKey") or "").strip()
        if source_key and source_key != material_id:
            lines.append(f"{prefix}{material_id} [原文{source_key}] {label}：")
        else:
            lines.append(f"{prefix}{material_id} {label}：")
        lines.append(str(section.get("content", "")))
        lines.append("")

    return "\n".join(lines).strip()


def load_script_payload(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))
