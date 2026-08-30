import os

from flask import Blueprint, jsonify, request

from . import db
from .auth import hash_password, issue_token, require_auth, verify_password

bp = Blueprint("main", __name__)

INTERNAL_TOKEN = os.environ.get("INTERNAL_TOKEN", "internal-devsecret")


@bp.get("/healthz")
def healthz():
    return jsonify(status="ok"), 200


@bp.get("/readyz")
def readyz():
    try:
        db.db_ping()
        return jsonify(status="ready"), 200
    except Exception as e:
        return jsonify(status="not-ready", error=str(e)), 503


@bp.post("/auth/login")
def login():
    body = request.get_json(force=True)
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        return jsonify(error="username and password required"), 400

    existing = db.get_or_create_user(username, hash_password(password))
    if not verify_password(password, existing["password_hash"]):
        return jsonify(error="invalid credentials"), 401

    token = issue_token(existing["id"], existing["username"])
    return jsonify(token=token, username=existing["username"]), 200


@bp.get("/shows")
def shows():
    return jsonify(shows=db.list_shows()), 200


@bp.get("/shows/<show_id>/seats")
def seats(show_id):
    if not db.get_show(show_id):
        return jsonify(error="show not found"), 404
    return jsonify(show_id=show_id, seats=db.seat_grid(show_id)), 200


@bp.post("/shows/<show_id>/hold")
@require_auth
def hold_seats(show_id):
    if not db.get_show(show_id):
        return jsonify(error="show not found"), 404
    seat_ids = request.get_json(force=True)["seats"]
    ok, result = db.acquire_seat_lock(show_id, seat_ids)
    if not ok:
        return jsonify(error="seats unavailable", conflicts=result), 409
    return jsonify(hold_id=result, expires_in=120), 201


@bp.post("/internal/shows/<show_id>/finalize")
def finalize_hold(show_id):
    if request.headers.get("X-Internal-Token") != INTERNAL_TOKEN:
        return jsonify(error="forbidden"), 403
    body = request.get_json(force=True)
    ok = db.finalize_hold(show_id, body["hold_id"], body["seats"])
    if not ok:
        return jsonify(error="hold expired or invalid"), 409
    return jsonify(status="finalized"), 200
