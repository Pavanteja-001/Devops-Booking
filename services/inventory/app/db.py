import json
import os
import uuid

import redis
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .chaos import chaos

pool = ConnectionPool(os.environ.get("DATABASE_URL", "postgresql://inventory:inventory@localhost:5432/inventory_db"), min_size=1, max_size=5, timeout=2)
r = redis.Redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)

SEAT_ROWS = ["A", "B", "C", "D", "E"]
SEAT_COLS = range(1, 11)


def all_seat_ids():
    return [f"{row}{col}" for row in SEAT_ROWS for col in SEAT_COLS]


def db_ping():
    if chaos.db_pool_exhaust:
        raise RuntimeError("db pool exhausted (chaos)")
    with pool.connection(timeout=1) as conn:
        conn.execute("SELECT 1")


def acquire_seat_lock(show_id, seat_ids, ttl_seconds=120):
    already_booked = r.smembers(f"booked:{show_id}") & set(seat_ids)
    if already_booked:
        return False, sorted(already_booked)

    hold_id = str(uuid.uuid4())
    keys = [f"lock:{show_id}:{s}" for s in seat_ids]
    pipe = r.pipeline()
    for k in keys:
        pipe.set(k, hold_id, nx=True, ex=ttl_seconds)
    results = pipe.execute()
    if all(results):
        publish_seat_update(show_id, seat_ids, "held")
        return True, hold_id
    for k, got in zip(keys, results):
        if got:
            r.delete(k)
    conflicts = [k.split(":")[-1] for k, got in zip(keys, results) if not got]
    return False, conflicts


def finalize_hold(show_id, hold_id, seat_ids):
    keys = [f"lock:{show_id}:{s}" for s in seat_ids]
    values = r.mget(keys)
    if not all(v == hold_id for v in values):
        return False
    pipe = r.pipeline()
    for k in keys:
        pipe.delete(k)
    pipe.sadd(f"booked:{show_id}", *seat_ids)
    pipe.execute()
    publish_seat_update(show_id, seat_ids, "booked")
    return True


def publish_seat_update(show_id, seat_ids, status):
    r.publish(f"seat-updates:{show_id}", json.dumps({"seats": seat_ids, "status": status}))


def get_or_create_user(username, password_hash):
    with pool.connection() as conn:
        conn.row_factory = dict_row
        row = conn.execute("SELECT id, username, password_hash FROM users WHERE username = %s", (username,)).fetchone()
        if row:
            return row
        row = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s) RETURNING id, username, password_hash",
            (username, password_hash),
        ).fetchone()
        conn.commit()
        return row


def list_shows():
    with pool.connection() as conn:
        conn.row_factory = dict_row
        return conn.execute("SELECT id, title, starts_at FROM shows ORDER BY starts_at").fetchall()


def get_show(show_id):
    with pool.connection() as conn:
        conn.row_factory = dict_row
        return conn.execute("SELECT id, title, starts_at FROM shows WHERE id = %s", (show_id,)).fetchone()


def seat_grid(show_id):
    booked = r.smembers(f"booked:{show_id}")
    held_keys = r.keys(f"lock:{show_id}:*")
    held = {k.split(":")[-1] for k in held_keys}
    seats = []
    for seat_id in all_seat_ids():
        if seat_id in booked:
            status = "booked"
        elif seat_id in held:
            status = "held"
        else:
            status = "available"
        seats.append({"id": seat_id, "status": status})
    return seats
