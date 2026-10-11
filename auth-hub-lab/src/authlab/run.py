"""Start every service of the lab in one process (one thread + one port each)."""

import logging
import threading
import time

from werkzeug.serving import make_server

from . import config
from .app import create_app
from .common import reset_trace
from .console import create_console_app
from .hub import create_hub_app
from .idp import create_idp_app
from .spoke import create_spoke_app


def build_services() -> dict:
    services = {"console": create_console_app(), "hub": create_hub_app()}
    for key, spec in config.IDPS.items():
        # The only registered client at a customer IdP is the hub.
        clients = {config.HUB_CLIENT_ID_AT_IDP: {"secret": config.HUB_SECRET_AT_IDP[key],
                                                 "redirect_uris": [f"{config.url('hub')}/callback"]}}
        services[key] = create_idp_app(key, config.url(key), spec["label"], spec["users"], clients)
    for key in config.SPOKES:
        services[key] = create_spoke_app(key)
    for key in config.APPS:
        services[key] = create_app(key)
    return services


class Lab:
    def __init__(self):
        self._servers = [make_server("localhost", config.port(name), app, threaded=True)
                         for name, app in build_services().items()]

    def start(self):
        for server in self._servers:
            threading.Thread(target=server.serve_forever, daemon=True).start()

    def stop(self):
        for server in self._servers:
            server.shutdown()


def main():
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    reset_trace()
    lab = Lab()
    lab.start()
    print(f"Auth lab running. Console: {config.url('console')}   App A: {config.url('app_a')}   App B: {config.url('app_b')}")
    print("Ctrl+C to stop.")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        lab.stop()


if __name__ == "__main__":
    main()
