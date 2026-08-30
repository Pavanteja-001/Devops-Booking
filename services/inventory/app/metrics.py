import time

from flask import Response, request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

SERVICE = "inventory"

REQUESTS = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["service", "method", "path", "status"],
)
LATENCY = Histogram(
    "http_request_duration_seconds",
    "Request latency",
    ["service", "method", "path"],
)


def register_metrics(app):
    @app.before_request
    def _start():
        request._t0 = time.perf_counter()

    @app.after_request
    def _record(resp):
        if request.path != "/metrics":
            route = request.url_rule.rule if request.url_rule else "unmatched"
            elapsed = time.perf_counter() - getattr(request, "_t0", time.perf_counter())
            REQUESTS.labels(SERVICE, request.method, route, resp.status_code).inc()
            LATENCY.labels(SERVICE, request.method, route).observe(elapsed)
        return resp

    @app.get("/metrics")
    def _metrics():
        return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)
