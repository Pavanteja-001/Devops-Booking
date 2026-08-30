import random
import threading
import time

from flask import jsonify, request


class ChaosState:
    def __init__(self):
        self.error_rate = 0.0
        self.latency_ms = 0
        self.db_pool_exhaust = False
        self.lock = threading.Lock()

    def snapshot(self):
        return {
            "error_rate": self.error_rate,
            "latency_ms": self.latency_ms,
            "db_pool_exhaust": self.db_pool_exhaust,
        }


chaos = ChaosState()


def register_chaos(app):
    @app.before_request
    def _apply_chaos():
        if request.path.startswith(("/healthz", "/readyz", "/metrics", "/admin")):
            return None
        if chaos.latency_ms:
            time.sleep(chaos.latency_ms / 1000.0)
        if chaos.error_rate and random.random() < chaos.error_rate:
            return jsonify({"error": "injected failure"}), 500
        return None

    @app.post("/admin/chaos")
    def _set_chaos():
        body = request.get_json(force=True)
        with chaos.lock:
            for k in ("error_rate", "latency_ms", "db_pool_exhaust"):
                if k in body:
                    setattr(chaos, k, body[k])
        return jsonify(chaos.snapshot())

    @app.get("/admin/chaos")
    def _get_chaos():
        return jsonify(chaos.snapshot())
