import datetime
import functools
import os

import bcrypt
import jwt
from flask import jsonify, request

JWT_SECRET = os.environ.get("JWT_SECRET", "devsecret-change-me")
JWT_ALGO = "HS256"


def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password, password_hash):
    return bcrypt.checkpw(password.encode(), password_hash.encode())


def issue_token(user_id, username):
    payload = {
        "sub": user_id,
        "username": username,
        "exp": datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=1),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)


def decode_token(token):
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])


def require_auth(fn):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return jsonify(error="missing bearer token"), 401
        try:
            claims = decode_token(header.removeprefix("Bearer "))
        except jwt.PyJWTError:
            return jsonify(error="invalid token"), 401
        request.user = claims
        return fn(*args, **kwargs)

    return wrapper
