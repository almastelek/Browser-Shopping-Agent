"""
SQLite storage for history and preferences.
Optional component for Phase 5.
"""
import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Any


class Database:
    """Simple SQLite database for storing search history."""
    
    def __init__(self, db_path: str = "agentic_shopper.db"):
        self.db_path = Path(db_path)
        self._init_db()
    
    def _init_db(self):
        """Initialize database tables."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS search_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    query TEXT NOT NULL,
                    decision_spec TEXT NOT NULL,
                    top_picks TEXT NOT NULL,
                    total_candidates INTEGER,
                    created_at TEXT NOT NULL
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS preferences (
                    id INTEGER PRIMARY KEY,
                    data TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.commit()
    
    def save_search(
        self,
        query: str,
        decision_spec: dict,
        top_picks: list[dict],
        total_candidates: int
    ) -> int:
        """Save a search to history."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                """
                INSERT INTO search_history 
                (query, decision_spec, top_picks, total_candidates, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    query,
                    json.dumps(decision_spec),
                    json.dumps(top_picks),
                    total_candidates,
                    datetime.now().isoformat()
                )
            )
            conn.commit()
            return cursor.lastrowid
    
    def get_history(self, limit: int = 10) -> list[dict]:
        """Get recent search history."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                """
                SELECT * FROM search_history 
                ORDER BY created_at DESC 
                LIMIT ?
                """,
                (limit,)
            )
            rows = cursor.fetchall()
            
            return [
                {
                    "id": row["id"],
                    "query": row["query"],
                    "decision_spec": json.loads(row["decision_spec"]),
                    "top_picks": json.loads(row["top_picks"]),
                    "total_candidates": row["total_candidates"],
                    "created_at": row["created_at"]
                }
                for row in rows
            ]
    
    def save_preferences(self, preferences: dict) -> None:
        """Save user preferences."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO preferences (id, data, updated_at)
                VALUES (1, ?, ?)
                """,
                (json.dumps(preferences), datetime.now().isoformat())
            )
            conn.commit()
    
    def get_preferences(self) -> dict | None:
        """Get saved preferences."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT data FROM preferences WHERE id = 1"
            )
            row = cursor.fetchone()
            return json.loads(row[0]) if row else None


# Singleton instance
db = Database()
