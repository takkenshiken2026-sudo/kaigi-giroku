from __future__ import annotations

from typing import Dict, List

DEFAULT_TEMPLATE = "standard"

COMMON_RULES = """あなたは日本語の議事録作成アシスタントです。
文字起こしテキストを、指定のMarkdown形式に整理してください。

最重要ルール（必ず守る）:
- 文字起こしに書かれている事実だけを書く。推測・想像・補完は禁止。
- 「〜と思われる」「〜が期待される」「〜かもしれない」などの表現は使わない。
- 文字起こしに出てこない人物名・役職・担当・会議名・期限を作らない。
- 決定事項・アクション・次回予定などは、文字起こしに明確な根拠がある場合のみ書く。
- 根拠がないセクションは必ず「（記載なし）」または空の表1行だけにする。

音声の種類:
- 複数者の会議・打ち合わせなら、発言内容を整理して議事録にする。
- CM・ナレーション・独白・商品紹介など会議でない音声は、会議があったと書かない。
  概要に「会議の記録ではない」旨を1行入れ、内容は文字起こしの要約に留める。

文体: 簡潔なビジネス文書調
"""

TEMPLATE_SPECS: Dict[str, dict] = {
    "standard": {
        "label": "標準",
        "hint": "概要・議事内容・決定事項・アクション・次回予定",
        "ollama_structure": """必ず次の構造で出力:

# 議事録

## 概要
（文字起こしから分かることだけを3〜5行。会議でない場合はその旨を明記）

## 議事内容
（トピックごとに整理。文字起こしの範囲内）

## 決定事項
（箇条書き。根拠がなければ「（記載なし）」のみ）

## アクションアイテム
（Markdown表。列: 担当 | 内容 | 期限。根拠がなければ空行1つだけ）

## 次回予定
（箇条書き。根拠がなければ「（記載なし）」のみ）""",
        "fallback_sections": [
            ("議事内容", "transcript"),
            ("決定事項", "placeholder_list"),
            ("アクションアイテム", "action_table"),
            ("次回予定", "placeholder_list"),
        ],
    },
    "standup": {
        "label": "定例ミーティング",
        "hint": "進捗・予定・課題を中心に整理",
        "ollama_structure": """必ず次の構造で出力:

# 議事録

## 概要
（定例の目的と全体の流れを3〜5行。会議でない場合はその旨を明記）

## 進捗・報告
（前回からの進捗や各担当の報告。文字起こしの範囲内）

## 今後の予定・課題
（予定された作業や懸念点。根拠がなければ「（記載なし）」）

## 決定事項
（箇条書き。根拠がなければ「（記載なし）」のみ）

## 次回予定
（日時・内容。根拠がなければ「（記載なし）」のみ）""",
        "fallback_sections": [
            ("進捗・報告", "transcript"),
            ("今後の予定・課題", "empty_note"),
            ("決定事項", "placeholder_list"),
            ("次回予定", "placeholder_list"),
        ],
    },
    "simple": {
        "label": "シンプル",
        "hint": "概要と内容のみ。短くまとめたいとき向け",
        "ollama_structure": """必ず次の構造で出力:

# 議事録

## 概要
（文字起こしから分かることだけを3〜5行。会議でない場合はその旨を明記）

## 内容
（話題ごとに整理。文字起こしの範囲内）""",
        "fallback_sections": [
            ("内容", "transcript"),
        ],
    },
    "report": {
        "label": "報告会",
        "hint": "報告内容と質疑を分けて整理",
        "ollama_structure": """必ず次の構造で出力:

# 議事録

## 概要
（報告会の目的と全体の流れを3〜5行。会議でない場合はその旨を明記）

## 報告内容
（発表・報告の要点。文字起こしの範囲内）

## 質疑・コメント
（質問と回答、コメント。根拠がなければ「（記載なし）」）

## 決定事項
（箇条書き。根拠がなければ「（記載なし）」のみ）

## 次回予定
（箇条書き。根拠がなければ「（記載なし）」のみ）""",
        "fallback_sections": [
            ("報告内容", "transcript"),
            ("質疑・コメント", "empty_note"),
            ("決定事項", "placeholder_list"),
            ("次回予定", "placeholder_list"),
        ],
    },
}

PLACEHOLDER_LIST = "- （追記してください）"
EMPTY_NOTE = "- （記載なし）"
ACTION_TABLE = """| 担当 | 内容 | 期限 |
|------|------|------|
| | | |"""


def normalize_template_id(template: str | None) -> str:
    if template and template in TEMPLATE_SPECS:
        return template
    return DEFAULT_TEMPLATE


def list_templates() -> List[dict]:
    return [
        {
            "id": template_id,
            "label": spec["label"],
            "hint": spec["hint"],
        }
        for template_id, spec in TEMPLATE_SPECS.items()
    ]


def get_system_prompt(template: str | None) -> str:
    template_id = normalize_template_id(template)
    structure = TEMPLATE_SPECS[template_id]["ollama_structure"]
    return f"{COMMON_RULES}\n\n{structure}"


def build_fallback_minutes(template: str | None, meta_block: str, body: str) -> str:
    template_id = normalize_template_id(template)
    sections = TEMPLATE_SPECS[template_id]["fallback_sections"]
    parts = ["# 議事録", "", meta_block, ""]

    for title, kind in sections:
        parts.append(f"## {title}")
        parts.append("")
        if kind == "transcript":
            parts.append(body)
        elif kind == "placeholder_list":
            parts.append(PLACEHOLDER_LIST)
        elif kind == "empty_note":
            parts.append(EMPTY_NOTE)
        elif kind == "action_table":
            parts.append(ACTION_TABLE)
        parts.append("")

    return "\n".join(parts).rstrip() + "\n"
