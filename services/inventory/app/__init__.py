from flask import Flask

from .chaos import register_chaos
from .metrics import register_metrics
from .routes import bp


def create_app():
    app = Flask(__name__)
    register_metrics(app)
    register_chaos(app)
    app.register_blueprint(bp)
    return app
