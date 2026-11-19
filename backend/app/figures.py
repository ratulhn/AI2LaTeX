"""Vector figures that ship with the prototype.

Everything here is plain SVG, so figures stay sharp in the PDF preview and in
the client-side print export (no <img> round trip, no raster artefacts).
"""
from __future__ import annotations

ACCENT = "#002855"


HANDSHAKE_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 250" width="520" height="250" role="img" aria-label="TCP three-way handshake">
  <defs>
    <marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#0f172a"/>
    </marker>
  </defs>
  <g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#0f172a">
    <rect x="24" y="16" width="120" height="34" rx="6" fill="#eff6ff" stroke="#bfdbfe"/>
    <text x="84" y="38" text-anchor="middle" font-weight="600">Client</text>
    <rect x="376" y="16" width="120" height="34" rx="6" fill="#eff6ff" stroke="#bfdbfe"/>
    <text x="436" y="38" text-anchor="middle" font-weight="600">Server</text>
    <line x1="84" y1="50" x2="84" y2="220" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 4"/>
    <line x1="436" y1="50" x2="436" y2="220" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4 4"/>
    <line x1="84" y1="78" x2="428" y2="98" stroke="#0f172a" stroke-width="1.6" marker-end="url(#ar)"/>
    <text x="256" y="74" text-anchor="middle" font-size="11" font-weight="600">SYN</text>
    <line x1="436" y1="122" x2="92" y2="142" stroke="#0f172a" stroke-width="1.6" marker-end="url(#ar)"/>
    <text x="264" y="138" text-anchor="middle" font-size="11" font-weight="600">SYN-ACK</text>
    <line x1="84" y1="166" x2="428" y2="186" stroke="#0f172a" stroke-width="1.6" marker-end="url(#ar)"/>
    <text x="256" y="182" text-anchor="middle" font-size="11" font-weight="600">ACK</text>
    <text x="260" y="232" text-anchor="middle" font-size="10" fill="#64748b">(a) Three-way handshake</text>
  </g>
</svg>"""


CWND_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 250" width="520" height="250" role="img" aria-label="TCP congestion window growth">
  <g font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#0f172a">
    <line x1="64" y1="26" x2="64" y2="196" stroke="#94a3b8" stroke-width="1"/>
    <line x1="64" y1="196" x2="470" y2="196" stroke="#94a3b8" stroke-width="1"/>
    <text x="28" y="104" fill="#64748b" transform="rotate(-90 28 104)" text-anchor="middle">cwnd (MSS)</text>
    <text x="46" y="200" fill="#64748b" text-anchor="end">1</text>
    <text x="46" y="158" fill="#64748b" text-anchor="end">2</text>
    <text x="46" y="116" fill="#64748b" text-anchor="end">4</text>
    <text x="46" y="74" fill="#64748b" text-anchor="end">8</text>
    <line x1="64" y1="154" x2="470" y2="154" stroke="#e2e8f0" stroke-width="1"/>
    <line x1="64" y1="112" x2="470" y2="112" stroke="#e2e8f0" stroke-width="1"/>
    <line x1="64" y1="70" x2="470" y2="70" stroke="#e2e8f0" stroke-width="1"/>
    <path d="M64,196 L100,196 L100,154 L150,154 L150,112 L214,112 L214,70 L360,70"
          fill="none" stroke="{ACCENT}" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="100" cy="154" r="3.4" fill="{ACCENT}"/>
    <circle cx="150" cy="112" r="3.4" fill="{ACCENT}"/>
    <circle cx="214" cy="70" r="3.4" fill="{ACCENT}"/>
    <line x1="360" y1="70" x2="360" y2="196" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="4 3"/>
    <text x="366" y="88" font-size="10" fill="#b45309">loss detected</text>
    <text x="112" y="214" font-size="10" fill="#64748b" text-anchor="middle">1</text>
    <text x="188" y="214" font-size="10" fill="#64748b" text-anchor="middle">2</text>
    <text x="272" y="214" font-size="10" fill="#64748b" text-anchor="middle">3</text>
    <text x="356" y="214" font-size="10" fill="#64748b" text-anchor="middle">4</text>
    <text x="267" y="236" font-size="10" fill="#64748b" text-anchor="middle">(b) Congestion window &#183; slow start</text>
  </g>
</svg>"""


RAW_SCAN_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 250" width="520" height="250" role="img" aria-label="Original photographed sketch">
  <rect width="520" height="250" fill="#f5f5f0"/>
  <g stroke="#3f3f46" stroke-width="2.1" fill="none" stroke-linecap="round" opacity="0.82">
    <path d="M40,58 L486,66"/>
    <path d="M52,64 L52,214"/>
    <path d="M478,70 L478,214"/>
    <path d="M58,96 Q140,104 150,88"/>
    <path d="M148,84 L478,92"/>
    <path d="M470,96 Q230,118 70,140"/>
    <path d="M66,148 L150,146"/>
    <path d="M150,152 Q470,146 474,140"/>
    <path d="M96,200 Q220,168 300,190 Q380,206 452,180"/>
    <path d="M304,84 L300,92 M302,88 L306,96"/>
  </g>
  <g fill="#3f3f46" font-family="'Comic Sans MS', 'Segoe Print', cursive" font-size="11" opacity="0.8">
    <text x="52" y="46">client</text>
    <text x="452" y="52">server</text>
    <text x="176" y="80">SYN &#8594;</text>
    <text x="238" y="112">&#8592; SYN ACK</text>
    <text x="200" y="140">ACK &#8594;</text>
    <text x="86" y="196">window grows 1 2 4 8</text>
  </g>
  <g opacity="0.18" fill="#64748b">
    <circle cx="120" cy="228" r="16"/>
  </g>
</svg>"""


ARCH_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 260" width="520" height="260" role="img" aria-label="System architecture">
  <defs>
    <marker id="a2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="#64748b"/>
    </marker>
  </defs>
  <g font-family="Helvetica, Arial, sans-serif" font-size="11" fill="#0f172a">
    <rect x="24" y="30" width="140" height="52" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="94" y="52" text-anchor="middle" font-weight="600">Chat + OCR</text>
    <text x="94" y="68" text-anchor="middle" font-size="10" fill="#64748b">Gemini 2.5 Flash</text>
    <rect x="190" y="30" width="150" height="52" rx="8" fill="#eff6ff" stroke="#bfdbfe"/>
    <text x="265" y="52" text-anchor="middle" font-weight="600">FastAPI</text>
    <text x="265" y="68" text-anchor="middle" font-size="10" fill="#64748b">orchestration</text>
    <rect x="366" y="30" width="130" height="52" rx="8" fill="#f8fafc" stroke="#cbd5e1"/>
    <text x="431" y="52" text-anchor="middle" font-weight="600">Tectonic</text>
    <text x="431" y="68" text-anchor="middle" font-size="10" fill="#64748b">PDF compile</text>
    <rect x="190" y="118" width="150" height="46" rx="8" fill="#fff" stroke="#e2e8f0"/>
    <text x="265" y="146" text-anchor="middle" font-weight="600">SQLite</text>
    <rect x="366" y="118" width="130" height="46" rx="8" fill="#fff" stroke="#e2e8f0"/>
    <text x="431" y="146" text-anchor="middle" font-weight="600">Assets</text>
    <rect x="24" y="118" width="140" height="46" rx="8" fill="#fff" stroke="#e2e8f0"/>
    <text x="94" y="146" text-anchor="middle" font-weight="600">Canvas AST</text>
    <line x1="164" y1="56" x2="186" y2="56" stroke="#64748b" stroke-width="1.5" marker-end="url(#a2)"/>
    <line x1="340" y1="56" x2="362" y2="56" stroke="#64748b" stroke-width="1.5" marker-end="url(#a2)"/>
    <line x1="265" y1="82" x2="265" y2="114" stroke="#64748b" stroke-width="1.5" marker-end="url(#a2)"/>
    <line x1="340" y1="141" x2="362" y2="141" stroke="#64748b" stroke-width="1.5" marker-end="url(#a2)"/>
    <line x1="266" y1="56" x2="160" y2="118" stroke="#cbd5e1" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="266" y="204" text-anchor="middle" font-size="10" fill="#64748b">one AST — visual canvas, source editor and PDF stay in sync</text>
  </g>
</svg>"""

FIGURE_LIBRARY: dict[str, dict[str, str]] = {
    "tcp-handshake.svg": {
        "svg": HANDSHAKE_SVG,
        "label": "Three-way handshake",
        "caption": "TCP Congestion Window & Handshake Flow.",
        "description": "TCP three-way handshake between client and server",
    },
    "tcp-cwnd.svg": {
        "svg": CWND_SVG,
        "label": "Congestion window · slow start",
        "caption": "Congestion window growth during slow start.",
        "description": "TCP congestion window doubling per round trip in slow start",
    },
    "tcp-scan-raw.svg": {
        "svg": RAW_SCAN_SVG,
        "label": "Original photographed sketch",
        "caption": "Original photographed handshake sketch.",
        "description": "A photographed hand-drawn TCP handshake sketch",
    },
    "system-architecture.svg": {
        "svg": ARCH_SVG,
        "label": "System architecture",
        "caption": "AI2LaTeX system architecture.",
        "description": "Layered architecture: chat and OCR, FastAPI, SQLite, LaTeX engine, assets",
    },
}
