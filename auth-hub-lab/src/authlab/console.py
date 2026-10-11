"""A small control panel: service map, the hub's organization registry, and a live hop trace."""

import requests
from flask import Flask, jsonify

from . import config
from .common import page, read_trace, reset_trace

CONSOLE = """
<h1>Hub-and-spoke auth lab</h1>
<p class="muted">Log in through an app, then watch each hop appear below. Everything runs on localhost.</p>
<table>
  <tr><th>Layer</th><th>Service</th><th>URL</th></tr>
  <tr><td>4 App</td><td>App A (trusts App-A-Dev)</td><td><a href="{{ u('app_a') }}">{{ u('app_a') }}</a></td></tr>
  <tr><td>4 App</td><td>App B (trusts App-B-Prod)</td><td><a href="{{ u('app_b') }}">{{ u('app_b') }}</a></td></tr>
  <tr><td>3 Spoke</td><td>App-A-Dev / App-B-Prod tenants</td><td>{{ u('spoke_a_dev') }}, {{ u('spoke_b_prod') }}</td></tr>
  <tr><td>2 Hub</td><td>Central hub tenant</td><td>{{ u('hub') }}</td></tr>
  <tr><td>1 IdPs</td><td>Acme, Globex, Initech</td><td>{{ u('idp_acme') }}, {{ u('idp_globex') }}, {{ u('idp_initech') }}</td></tr>
</table>
<h2 style="font-size:16px;margin-top:20px">Organizations registered in the hub</h2>
<p id="orgs" class="muted">loading...</p>
<h2 style="font-size:16px;margin-top:20px">Live trace <a href="#" onclick="fetch('/reset',{method:'POST'});return false" style="font-size:12px">(clear)</a></h2>
<table id="trace"><tr><td class="muted">No events yet.</td></tr></table>
<script>
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function tick() {
  try {
    const t = await (await fetch('/trace.json')).json();
    const rows = t.events.map(e => {
      const {note, ...rest} = e.detail;
      return `<tr><td>${new Date(e.t*1000).toLocaleTimeString()}</td><td><b>${esc(e.service)}</b></td><td>${esc(e.event)}</td>` +
             `<td><code>${esc(JSON.stringify(rest))}</code>${note ? `<div class="muted">${esc(note)}</div>` : ''}</td></tr>`;
    });
    document.getElementById('trace').innerHTML = rows.join('') || '<tr><td class="muted">No events yet.</td></tr>';
    document.getElementById('orgs').innerHTML = t.orgs.map(o => `<code>${esc(o.domain)}</code> &rarr; ${esc(o.name)} (${esc(o.idp)})`).join('<br>') || 'none';
  } catch (e) {}
}
tick(); setInterval(tick, 1000);
</script>"""


def create_console_app() -> Flask:
    app = Flask("console")

    @app.get("/")
    def home():
        return page("Auth lab console", CONSOLE, u=config.url)

    @app.get("/trace.json")
    def trace_json():
        try:
            orgs = requests.get(f"{config.url('hub')}/admin/organizations", timeout=2,
                                headers={"Authorization": f"Bearer {config.HUB_ADMIN_TOKEN}"}).json()
        except requests.RequestException:
            orgs = []
        return jsonify(events=read_trace(), orgs=orgs)

    @app.post("/reset")
    def reset():
        reset_trace()
        return ("", 204)

    return app
