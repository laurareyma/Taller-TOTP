"""Páginas HTML del servidor de autorización. Se abren en el navegador del sistema, nunca en un WebView."""

from __future__ import annotations

from html import escape

from fastapi.responses import HTMLResponse

# Evita que la página se cargue dentro de un iframe ajeno (clickjacking) y que se guarde en caché.
# No se usa form-action: Chrome también la aplica a la redirección final hacia el deep link de la app.
SECURITY_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
}

_STYLE = """
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, system-ui, Roboto, sans-serif; background: #F5F7FA; color: #14213D; }
main { max-width: 420px; margin: 0 auto; padding: 48px 24px; }
h1 { font-size: 24px; margin: 0 0 4px; }
p.muted { color: #5C6B80; margin: 0 0 28px; }
label { display: block; font-weight: 600; font-size: 14px; margin: 16px 0 6px; }
input { width: 100%; min-height: 48px; padding: 0 14px; font-size: 16px; border: 1px solid #D5DCE6; border-radius: 10px; background: #fff; }
button { width: 100%; min-height: 48px; margin-top: 24px; border: 0; border-radius: 12px; font-size: 16px; font-weight: 600; }
button.primary { background: #1A4D8F; color: #fff; }
button.link { background: transparent; color: #1A4D8F; margin-top: 8px; }
.error { background: #FDECEA; color: #C62828; padding: 12px 14px; border-radius: 10px; margin-bottom: 8px; }
.demo-card { background: #EBF3FC; border: 1px solid #C4DCFA; border-radius: 10px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #1A4D8F; line-height: 1.4; }
.demo-card code { font-family: monospace; font-weight: 600; background: #D5E7FC; padding: 2px 4px; border-radius: 4px; }
"""


def _page(title: str, body: str, status: int = 200) -> HTMLResponse:
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<style>{_STYLE}</style>
</head>
<body><main>{body}</main></body>
</html>"""
    return HTMLResponse(html, status_code=status, headers=SECURITY_HEADERS)


def login_page(request_id: str, *, username: str = "", error: str | None = None, status: int = 200) -> HTMLResponse:
    error_html = f'<div class="error" role="alert">{escape(error)}</div>' if error else ""
    body = f"""
<h1>Iniciar sesión</h1>
<p class="muted">UniSabana Auth te pide acceso para la app móvil.</p>
<div class="demo-card">
  <strong>Usuario de demostración:</strong><br>
  Correo: <code>estudiante@unisabana.edu.co</code><br>
  Contraseña: <code>Sabana2026!</code>
</div>
{error_html}
<form method="post" action="/oauth/authorize">
  <input type="hidden" name="request_id" value="{escape(request_id)}">
  <label for="username">Correo</label>
  <input id="username" name="username" type="email" value="{escape(username)}" autocomplete="username" autocapitalize="none" required>
  <label for="password">Contraseña</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button class="primary" type="submit" name="action" value="login">Ingresar</button>
  <button class="link" type="submit" name="action" value="cancel" formnovalidate>Cancelar</button>
</form>"""
    return _page("Iniciar sesión", body, status)


def error_page(message: str, status: int = 400) -> HTMLResponse:
    body = f"""
<h1>No se pudo continuar</h1>
<div class="error" role="alert">{escape(message)}</div>
<p class="muted">Cierra esta ventana y vuelve a intentarlo desde la app.</p>"""
    return _page("Error", body, status)
