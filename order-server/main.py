"""Izzy's Cafe order server — runs on the Raspberry Pi.

A tiny FastAPI + SQLite app that backs izzybennett.com/order (place an order) and
izzybennett.com/orders (the kitchen queue). The static site reaches it over a
Cloudflare Tunnel at https://orders.izzybennett.com, so CORS is locked to the site
origin. No auth: anyone with the link can order or watch the board (by design).

Run it:
    python -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

The SQLite file lives next to this module and is created on first import.
"""

import json
import os
import sqlite3
import urllib.error
import urllib.request
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DB_PATH = Path(__file__).with_name("orders.db")

# Base URL of the OAuth Worker (same one /upload uses). The kitchen open/close toggle is verified
# against its /api/me endpoint, so only a signed-in GitHub user can flip it. Set RECIPE_API on the
# Pi to the deployed Worker URL; defaults to the local `wrangler dev` port for development.
RECIPE_API = os.environ.get("RECIPE_API", "http://localhost:8787").rstrip("/")

# Order lifecycle. "archived" drops a card off the kitchen board (the "Clear done" action)
# without deleting the row, so the history is still in the DB.
STATUSES = {"new", "making", "done", "archived"}

# Origins allowed to call this from a browser: the live site plus any localhost port (the `astro dev`
# server picks whatever port is free — 4321, 4322, …), so the whole flow works end-to-end without the
# tunnel. Localhost origins are only reachable from this machine, so allowing any port is safe.
ALLOWED_ORIGINS = ["https://izzybennett.com"]
ALLOWED_ORIGIN_REGEX = r"http://(localhost|127\.0\.0\.1):\d+"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(connect()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                drink       TEXT NOT NULL,
                temperature TEXT,  -- 'Hot' | 'Iced' (nullable: rows predate this column)
                milk        TEXT,
                syrups      TEXT NOT NULL DEFAULT '[]',  -- JSON array
                notes       TEXT,
                status      TEXT NOT NULL DEFAULT 'new',
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
            """
        )
        # Migration for DBs created before `temperature` existed — add the column if it's missing so
        # an in-place server update doesn't need a manual schema change or a wiped orders.db.
        have = {row["name"] for row in conn.execute("PRAGMA table_info(orders)")}
        if "temperature" not in have:
            conn.execute("ALTER TABLE orders ADD COLUMN temperature TEXT")
        # Small key/value store for app state — currently just whether the kitchen is open.
        conn.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
        conn.commit()


def get_setting(conn: sqlite3.Connection, key: str, default: str) -> str:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def kitchen_is_open(conn: sqlite3.Connection) -> bool:
    # Default open, so a fresh DB takes orders without any setup.
    return get_setting(conn, "kitchen_open", "1") == "1"


def verify_session(authorization: str | None) -> bool:
    """Validate the caller's opaque recipe session against the OAuth Worker's /api/me. A valid
    session can only belong to the allowed GitHub user, so this is both authn and authz. Fails
    closed (returns False) if the header is missing or the Worker is unreachable."""
    if not authorization or not authorization.startswith("Bearer "):
        return False
    # Send an explicit User-Agent: the Worker sits behind Cloudflare, whose bot protection 403s the
    # default "Python-urllib/x.y" UA before the request ever reaches the Worker — which would make
    # this fail closed and the kitchen toggle never work. Any non-bot UA gets through.
    req = urllib.request.Request(
        f"{RECIPE_API}/api/me",
        headers={"Authorization": authorization, "User-Agent": "izzy-orders/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status == 200
    except (urllib.error.URLError, OSError):
        return False


init_db()

app = FastAPI(title="Izzy's Cafe orders")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ALLOWED_ORIGIN_REGEX,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


class OrderIn(BaseModel):
    drink: str = Field(min_length=1, max_length=100)
    # Hot/iced choice. Required by the /order form (client-side), but kept optional here so a
    # brief site/Pi version skew during a deploy can't 422 legitimate orders; validated to the two
    # allowed values when present.
    temperature: Literal["Hot", "Iced"] | None = None
    name: str = Field(min_length=1, max_length=100)
    milk: str | None = Field(default=None, max_length=100)
    syrups: list[str] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=500)


class StatusIn(BaseModel):
    status: str


class KitchenIn(BaseModel):
    open: bool


def row_to_order(row: sqlite3.Row) -> dict:
    order = dict(row)
    # syrups is stored as a JSON string; hand it back to clients as a real array.
    order["syrups"] = json.loads(order["syrups"] or "[]")
    return order


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/status")
def get_status() -> dict:
    """Whether the kitchen is open. Polled by /order (to show the closed banner) and /orders."""
    with closing(connect()) as conn:
        return {"open": kitchen_is_open(conn)}


@app.post("/status")
def set_status(body: KitchenIn, authorization: str | None = Header(default=None)) -> dict:
    """Open or close the kitchen (the /orders toggle). Requires a valid GitHub sign-in (verified
    against the OAuth Worker). Closing rejects new orders."""
    if not verify_session(authorization):
        raise HTTPException(status_code=401, detail="sign in with GitHub to open or close the kitchen")
    with closing(connect()) as conn:
        set_setting(conn, "kitchen_open", "1" if body.open else "0")
        conn.commit()
    return {"open": body.open}


@app.post("/orders", status_code=201)
def create_order(order: OrderIn) -> dict:
    drink = order.drink.strip()
    if not drink:
        raise HTTPException(status_code=422, detail="drink is required")
    name = order.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="name is required")

    ts = now_iso()
    # Keep only non-empty syrup strings.
    syrups = [s.strip() for s in order.syrups if s and s.strip()]

    def clean(v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None

    with closing(connect()) as conn:
        # Enforce closed-kitchen server-side, not just in the UI, so a stale page can't sneak an
        # order in after closing.
        if not kitchen_is_open(conn):
            raise HTTPException(status_code=403, detail="kitchen is closed")
        cur = conn.execute(
            """
            INSERT INTO orders (name, drink, temperature, milk, syrups, notes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)
            """,
            (name, drink, order.temperature, clean(order.milk), json.dumps(syrups), clean(order.notes), ts, ts),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (cur.lastrowid,)).fetchone()
    return row_to_order(row)


@app.get("/orders")
def list_orders() -> list[dict]:
    """Active (non-archived) orders, newest first. The kitchen board rebuilds from the full list
    each poll, so there's no incremental cursor to maintain."""
    with closing(connect()) as conn:
        rows = conn.execute(
            "SELECT * FROM orders WHERE status != 'archived' ORDER BY id DESC"
        ).fetchall()
    return [row_to_order(r) for r in rows]


@app.patch("/orders/{order_id}")
def update_status(order_id: int, body: StatusIn) -> dict:
    status = body.status.strip()
    if status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(STATUSES)}")

    with closing(connect()) as conn:
        cur = conn.execute(
            "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
            (status, now_iso(), order_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="order not found")
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return row_to_order(row)
