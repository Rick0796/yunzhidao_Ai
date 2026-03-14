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

ENTITY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    ("musk", ("马斯克", "musk", "spacex", "特斯拉")),
    ("jack_ma", ("马云", "蚂蚁")),
    ("brand", ("大力老师", "周老师", "云智道", "我们公司", "技术顾问团")),
]

TOPIC_FAMILY_PATTERNS: list[tuple[str, tuple[str, ...]]] = [
    (
        "musk_agi_prophecy",
        (
            "马斯克",
            "agi",
            "2030",
            "通用人工智能",
            "智能总和",
            "十倍",
            "退休",
            "钱不重要",
            "智能密度",
            "别存钱",
        ),
    ),
    (
        "musk_ai_economy",
        (
            "马斯克",
            "政府唯一能做",
            "发钱",
            "能源和算力",
            "物价暴跌",
            "成本几乎归零",
            "商品和服务",
        ),
    ),
    (
        "musk_transition_anxiety",
        (
            "马斯克",
            "三到七年",
            "过渡期",
            "就业结构",
            "断崖",
            "还剩多少时间",
        ),
    ),
    (
        "musk_surgery_case",
        (
            "马斯克",
            "手术",
            "医生",
            "共享记忆",
            "外科",
            "机器人医生",
        ),
    ),
    ("musk_spacex_case", ("马斯克", "spacex", "火箭", "电池", "特斯拉", "第一性原理", "专利", "核聚变", "曲率")),
    ("trend_history_validation", ("微商", "直播会爆", "黄金", "回头看", "趋势从来不会等人")),
    ("ai_efficiency_system", ("效率系统", "应用场景", "变现逻辑", "能力重估", "效率差距")),
    ("ai_digital_asset", ("数字资产", "硬通货", "数字时代")),
    ("ai_job_replacement", ("岗位", "淘汰", "程序员", "设计师", "文案", "铁饭碗", "白领")),
    ("ai_training_offer", ("训练营", "直播课", "直播入口", "我要学习", "公开课")),
    ("risk_alert", ("分水岭", "清醒", "避开", "别踩", "风险", "坑")),
    ("ai_track_selection", ("赛道", "情绪经济", "长寿经济", "专业服务", "驾驭者")),
    ("wealth_asset_allocation", ("资产配置", "黄金", "信托", "显性资产", "隐形资产", "保险", "防火墙")),
]


def now_text() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def normalize_meta_text(*parts: Any) -> str:
    return " ".join(str(part or "").strip().lower() for part in parts if str(part or "").strip())


def contains_markers(text: str, *markers: str) -> bool:
    return any(marker.lower() in text for marker in markers)


def infer_entity_tag(*parts: Any) -> str:
    text = normalize_meta_text(*parts)
    if contains_markers(text, "大力老师", "周老师", "云智道", "技术顾问团", "我们公司"):
        return "brand"
    for tag, markers in ENTITY_PATTERNS:
        if any(marker.lower() in text for marker in markers):
            return tag
    return "none"


def infer_topic_family(theme: str, primary_direction: str, secondary_direction: str, content: str) -> str:
    # section-level family should be inferred mainly from the section body itself.
    # secondary_direction is often a document-level routing label like "训练营导流",
    # which would otherwise污染整篇所有板块的 family。
    text = normalize_meta_text(theme, primary_direction, content)

    if contains_markers(text, "我要学习", "我要看直播", "直播入口", "四天", "训练营", "直播课", "公开课", "财道营"):
        return "ai_training_offer"
    if contains_markers(text, "全面ai化", "涨粉1.2亿", "全流程自动化", "技术顾问团", "真实落地的系统"):
        return "ai_system_proof"
    if contains_markers(text, "普通老百姓", "买不起", "不是房子"):
        return "wealth_priority_shift"
    if contains_markers(text, "不是在吹牛", "风险提示书", "越听越后背发凉"):
        return "risk_alert"
    if contains_markers(text, "新的财富风口在哪里", "接下来这五分钟很重要", "我做的预言全都会兑现"):
        return "hook_prediction_confidence"
    if contains_markers(text, "下面这些话可能不讨喜", "早三年走出焦虑", "影响接下来几十年"):
        return "hook_hard_truth"
    if contains_markers(text, "全球80亿人都不知道的秘密", "99%的人还蒙在鼓里"):
        return "hook_global_secret"
    if contains_markers(text, "如果今天你看懂了", "正在经历的负债", "过得最轻松的一批人"):
        return "hook_watch_carefully"
    if contains_markers(text, "微商会火", "直播会爆", "买黄金", "趋势从来不会等人", "当年听进去的人"):
        return "trend_history_validation"
    if contains_markers(text, "30年前", "未来人人有手机", "不用带现金", "最后让所有人不得不接受"):
        return "trend_historical_analogy"
    if contains_markers(text, "89年的时候", "开工厂太牛了", "错过了互联网", "跟上时代走"):
        return "trend_factory_shift"
    if contains_markers(text, "普通人别划走", "ai要抢90%的工作", "几个赛道", "衣食无忧"):
        return "ai_track_selection"
    if contains_markers(text, "数字资产", "硬通货", "数字时代"):
        return "ai_digital_asset"
    if contains_markers(text, "升级效率系统", "应用场景", "变现逻辑", "能力重估", "效率差距"):
        return "ai_efficiency_system"
    if contains_markers(text, "会用ai", "驾驭机器", "想象力", "创造力", "共情力"):
        return "ai_capability_moat"
    if contains_markers(text, "创业者还是打工人", "全面地去了解和拥抱ai", "巨大的红利"):
        return "ai_adoption_call"
    if contains_markers(text, "没有方向", "进入ai这个行业", "不需要投钱", "不需要资源", "愿意动手"):
        return "ai_low_barrier_entry"
    if contains_markers(text, "窗口期", "从零开始的人", "原来的轨道上"):
        return "ai_window_period"
    if contains_markers(text, "创业财富指南", "国家已经把底牌亮出来了", "未来就是ai"):
        return "ai_epoch_signal"
    if contains_markers(text, "超级个体", "平台加超级个体", "自己就能烙饼"):
        return "ai_super_individual"
    if contains_markers(text, "情绪价值缺口", "做数字游民", "最贵的生意", "内容就是新的种子"):
        return "ai_method_guidance"
    if contains_markers(text, "程序员", "设计师", "文案下岗", "铁饭碗", "岗位", "被这个社会淘汰"):
        return "ai_job_replacement"
    if contains_markers(text, "被裁员的恐惧", "找工作更难了", "如果你还不会使用ai", "会被这个社会淘汰"):
        return "ai_job_threat"
    if contains_markers(text, "分水岭", "别踩", "风险", "避开", "清醒", "最关键的一次提醒"):
        return "risk_alert"
    if contains_markers(text, "为什么我敢这么说", "重新选赛道", "黄金窗口期", "固化圈层", "给自己选对赛道"):
        return "ai_transition_setup"
    if contains_markers(text, "接下来一分50秒", "接下来这二分钟", "少走三年弯路", "新的财富风口在哪里"):
        return "hook_warning"
    if contains_markers(text, "点个小心心", "点亮小爱心", "点赞收藏", "分享给", "先收藏起来"):
        return "cta_share_collect"
    if contains_markers(text, "能刷到这条视频", "说的就是你", "有爱心", "有福气", "眷顾你", "越来越好"):
        return "cta_identity_signal"
    if contains_markers(text, "如果现在连", "拿不出", "跟着我的思路走", "你就是赢家"):
        return "cta_pressure_money"
    if contains_markers(text, "起跑线上", "没有划走", "愿意主动改变命运"):
        return "cta_no_scroll_winner"
    if contains_markers(text, "未来不再是直播的时代", "最赚钱最暴利的行业就是ai", "第四次工业革命", "浪尖上冲浪"):
        return "ai_big_opportunity"
    if contains_markers(text, "春晚", "机器人表演", "脊背发凉"):
        return "spring_festival_robot_signal"
    if contains_markers(text, "排雷", "救火", "闯险境", "办公室里面那些算账填表"):
        return "robotics_application_case"
    if contains_markers(text, "字节", "豆包", "文心一言", "数字人直播", "便利店都用上了ai收银"):
        return "ai_platform_signal"
    if contains_markers(text, "数字ai人", "一键学会德文", "克隆了我的形象", "纯被动收入"):
        return "ai_digital_avatar_case"
    if contains_markers(text, "复活亲人", "老照片复活", "音容笑貌"):
        return "ai_memory_revival"
    if contains_markers(text, "mid journey", "证件照", "结婚照", "古装照", "五张你的素颜照"):
        return "ai_image_generation_case"
    if contains_markers(text, "特斯拉的工厂", "华为工厂", "无人机器人送", "萝卜快跑"):
        return "ai_factory_automation_case"
    if contains_markers(text, "57岁", "负债400多万", "半年多时间", "五六百"):
        return "ai_turnaround_case"
    if contains_markers(text, "马斯克") and contains_markers(text, "agi", "通用人工智能", "2030", "智能总和", "超音速海啸"):
        return "musk_agi_prophecy"
    if contains_markers(text, "马斯克") and contains_markers(text, "发钱", "智能密度", "能源和算力", "钱就不重要了", "成本几乎归零"):
        return "musk_ai_economy"
    if contains_markers(text, "马斯克") and contains_markers(text, "三到七年", "过渡期", "就业结构", "断崖", "还剩多少时间"):
        return "musk_transition_anxiety"
    if contains_markers(text, "马斯克") and contains_markers(text, "手术", "外科医生", "共享记忆", "机器人医生"):
        return "musk_surgery_case"
    if contains_markers(text, "马斯克", "spacex") or contains_markers(text, "火箭", "第一性原理", "电池成本", "特斯拉专利"):
        return "musk_spacex_case"
    if contains_markers(text, "资产配置", "黄金", "信托", "显性资产", "隐形资产", "防火墙", "财产险"):
        return "wealth_asset_allocation"

    for family, markers in TOPIC_FAMILY_PATTERNS:
        if all(marker.lower() in text for marker in markers[:1]) and any(marker.lower() in text for marker in markers[1:]):
            return family
        if sum(1 for marker in markers if marker.lower() in text) >= 2:
            return family

    if "ai" in text or "人工智能" in text:
        return "ai_general"
    if "财富" in text or "资产" in text or "财商" in text:
        return "wealth_general"
    if "认知" in text or "趋势" in text:
        return "cognition_general"
    return "general"


def infer_binding_scope(content: str, audience: str = "", secondary_direction: str = "") -> str:
    text = normalize_meta_text(content, audience, secondary_direction)
    if any(marker in text for marker in ("孩子", "家长", "父母", "家庭教育")):
        return "family"
    if any(marker in text for marker in ("婚姻", "夫妻", "情感", "伴侣")):
        return "relationship"
    if any(marker in text for marker in ("老板", "创业者", "企业")):
        return "business"
    return "general"


def canonical_direction_label(value: str) -> str:
    text = normalize_meta_text(value)
    if any(marker in text for marker in ("ai", "人工智能", "算法", "模型", "机器人", "数字人", "算力", "效率")):
        return "ai"
    if any(marker in text for marker in ("财富", "资产", "财商", "黄金", "保险", "房产", "现金流", "配置")):
        return "wealth"
    if any(marker in text for marker in ("认知", "趋势", "分水岭", "清醒", "规则", "判断")):
        return "cognition"
    return text


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

        entity_tag = infer_entity_tag(
            normalized["theme"],
            normalized["secondaryDirection"],
            section["content"],
        )
        topic_family = infer_topic_family(
            normalized["theme"],
            normalized["primaryDirection"],
            normalized["secondaryDirection"],
            section["content"],
        )
        binding_scope = infer_binding_scope(
            section["content"],
            normalized["audience"],
            normalized["secondaryDirection"],
        )

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
                entity_tag,
                topic_family,
                binding_scope,
                timestamp,
            )
        )

    connection.executemany(
        """
        INSERT INTO script_sections (
            document_id, order_index, section_key, source_key, material_id,
            section_type, section_index, global_index, content, entity_tag,
            topic_family, binding_scope, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        ensure_column(connection, "script_sections", "entity_tag", "TEXT NOT NULL DEFAULT 'none'")
        ensure_column(connection, "script_sections", "topic_family", "TEXT NOT NULL DEFAULT 'general'")
        ensure_column(connection, "script_sections", "binding_scope", "TEXT NOT NULL DEFAULT 'general'")
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
            SELECT s.id, s.section_key, s.source_key, s.section_type, s.section_index, s.material_id, s.global_index,
                   s.content, d.theme, d.primary_direction, d.secondary_direction, d.audience
            FROM script_sections s
            JOIN script_documents d ON d.id = s.document_id
            WHERE s.material_id IS NULL OR s.material_id = '' OR s.global_index IS NULL
            """
        ).fetchall()
        for row in rows:
            source_key = str(row["source_key"] or row["section_key"] or "").strip()
            global_index = parse_material_index(str(row["section_type"]), source_key, row["global_index"])
            if global_index is None:
                global_index = allocate_material_index(connection, str(row["section_type"]))
            material_id = f"{row['section_type']}{global_index}"
            entity_tag = infer_entity_tag(row["theme"], row["secondary_direction"], row["content"])
            topic_family = infer_topic_family(
                row["theme"],
                row["primary_direction"],
                row["secondary_direction"],
                row["content"],
            )
            binding_scope = infer_binding_scope(row["content"], row["audience"], row["secondary_direction"])
            connection.execute(
                """
                UPDATE script_sections
                SET source_key = ?, material_id = ?, global_index = ?, entity_tag = ?, topic_family = ?, binding_scope = ?
                WHERE id = ?
                """,
                (source_key, material_id, global_index, entity_tag, topic_family, binding_scope, row["id"]),
            )

        metadata_rows = connection.execute(
            """
            SELECT s.id, s.content, d.theme, d.primary_direction, d.secondary_direction, d.audience
            FROM script_sections s
            JOIN script_documents d ON d.id = s.document_id
            """
        ).fetchall()
        for row in metadata_rows:
            connection.execute(
                """
                UPDATE script_sections
                SET entity_tag = ?, topic_family = ?, binding_scope = ?
                WHERE id = ?
                """,
                (
                    infer_entity_tag(row["theme"], row["secondary_direction"], row["content"]),
                    infer_topic_family(
                        row["theme"],
                        row["primary_direction"],
                        row["secondary_direction"],
                        row["content"],
                    ),
                    infer_binding_scope(row["content"], row["audience"], row["secondary_direction"]),
                    row["id"],
                ),
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
                   section_type, section_index, content, entity_tag, topic_family, binding_scope
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
                "entityTag": section["entity_tag"] or infer_entity_tag(row["theme"], row["secondary_direction"], section["content"]),
                "topicFamily": section["topic_family"] or infer_topic_family(
                    row["theme"],
                    row["primary_direction"],
                    row["secondary_direction"],
                    section["content"],
                ),
                "bindingScope": section["binding_scope"]
                or infer_binding_scope(section["content"], row["audience"], row["secondary_direction"]),
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
                s.content,
                s.entity_tag,
                s.topic_family,
                s.binding_scope
            FROM script_sections s
            JOIN script_documents d ON d.id = s.document_id
            {where_clause}
            ORDER BY s.section_type ASC, s.global_index ASC, s.id ASC
            LIMIT ?
            """,
            (*params, row_limit),
        ).fetchall()
    filtered: list[dict[str, Any]] = []
    target_primary = canonical_direction_label(normalized_primary) if normalized_primary else ""
    target_secondary = normalize_meta_text(normalized_secondary)
    for row in rows:
        row_primary = canonical_direction_label(str(row["primary_direction"] or ""))
        row_secondary = normalize_meta_text(str(row["secondary_direction"] or ""))
        if target_primary and row_primary != target_primary:
            continue
        if target_secondary and target_secondary not in row_secondary:
            continue
        filtered.append(
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
                "entityTag": row["entity_tag"] or infer_entity_tag(row["theme"], row["secondary_direction"], row["content"]),
                "topicFamily": row["topic_family"] or infer_topic_family(
                    row["theme"],
                    row["primary_direction"],
                    row["secondary_direction"],
                    row["content"],
                ),
                "bindingScope": row["binding_scope"] or infer_binding_scope(row["content"], row["audience"], row["secondary_direction"]),
            }
        )
        if len(filtered) >= row_limit:
            break

    return filtered


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
