# renders every app icon in the shared style (dark tile, glowing ring with a dot, glyph in the app's colour)
# into apps/<slug>/public, at 256px so each stays under the daemon's 64 KiB icon limit. needs google chrome.
# usage: python3 tools/icons.py
import os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = tempfile.mkdtemp()
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# every glyph is drawn in a 512 box, centred on 256,256, for a ring of radius 172 (~150 usable), then scaled with the
# ring, which runs to within a stroke of the tile's edge so the mark fills the icon
G = {
    'MusicPlayerV1': ('#b26bff', '''
      <ellipse cx="222" cy="318" rx="46" ry="36" transform="rotate(-22 222 318)" fill="C"/>
      <rect x="252" y="160" width="22" height="160" rx="6" fill="C"/>
      <path d="M262 160 C 300 170, 330 190, 326 250 C 318 222, 300 210, 270 206 Z" fill="C"/>'''),
    'clock': ('#5aa9ff', '''
      <path d="M256 140 V 164 M256 348 V 372 M140 256 H 164 M348 256 H 372" stroke="C" stroke-width="18" stroke-linecap="round"/>
      <path d="M256 256 L 196 214 M256 256 L 326 206" stroke="C" stroke-width="20" stroke-linecap="round" fill="none"/>
      <circle cx="256" cy="256" r="14" fill="C"/>'''),
    'network-monitor': ('#22d3ee', '''
      <g fill="none" stroke="C" stroke-width="22" stroke-linecap="round">
        <path d="M160 236 A 136 136 0 0 1 352 236"/>
        <path d="M192 270 A 90 90 0 0 1 320 270"/>
        <path d="M224 302 A 45 45 0 0 1 288 302"/>
      </g>
      <circle cx="256" cy="336" r="16" fill="C"/>'''),
    'quote-flow': ('#e2e8f0', '''
      <g fill="C">
        <circle cx="200" cy="286" r="42"/><path d="M162 280 C 160 220, 190 190, 232 180 L 236 198 C 206 212, 196 236, 200 264 Z"/>
        <circle cx="314" cy="286" r="42"/><path d="M276 280 C 274 220, 304 190, 346 180 L 350 198 C 320 212, 310 236, 314 264 Z"/>
      </g>'''),
    'desk-exchange': ('#4ade80', '''
      <g stroke-width="8" stroke-linecap="round">
        <line x1="190" y1="160" x2="190" y2="340" stroke="#4ade80"/><rect x="170" y="190" width="40" height="110" rx="6" fill="#4ade80"/>
        <line x1="256" y1="196" x2="256" y2="364" stroke="#fb7185"/><rect x="236" y="220" width="40" height="110" rx="6" fill="#fb7185"/>
        <line x1="322" y1="148" x2="322" y2="316" stroke="#4ade80"/><rect x="302" y="168" width="40" height="120" rx="6" fill="#4ade80"/>
      </g>'''),
    'gold-tracker': ('#fbbf24', '''
      <g fill="C">
        <path d="M222 190 H 290 L 306 236 H 206 Z"/>
        <path d="M168 258 H 236 L 252 304 H 152 Z"/><path d="M276 258 H 344 L 360 304 H 260 Z"/>
      </g>
      <g fill="#fff3c4" opacity=".55"><rect x="222" y="190" width="68" height="8"/><rect x="168" y="258" width="68" height="8"/><rect x="276" y="258" width="68" height="8"/></g>'''),
    'o-map': ('#2dd4bf', '''
      <path d="M256 360 C 220 310, 186 272, 186 226 A 70 70 0 0 1 326 226 C 326 272, 292 310, 256 360 Z" fill="C"/>
      <circle cx="256" cy="226" r="28" fill="#0b0b12"/>'''),
    'o-photos': ('#f472b6', '''
      <rect x="160" y="176" width="192" height="160" rx="22" fill="none" stroke="C" stroke-width="20"/>
      <circle cx="304" cy="222" r="18" fill="C"/>
      <path d="M176 322 L 232 252 L 272 298 L 296 272 L 336 322 Z" fill="C"/>'''),
    'pixel-art': ('#fb923c', None),
    'deck': ('#ff6b6b', '''
      <g fill="C">
        <rect x="166" y="166" width="80" height="80" rx="18"/><rect x="266" y="166" width="80" height="80" rx="18" opacity=".7"/>
        <rect x="166" y="266" width="80" height="80" rx="18" opacity=".7"/><rect x="266" y="266" width="80" height="80" rx="18"/>
      </g>'''),
    'dev-board': ('#a3e635', '''
      <g fill="none" stroke="C" stroke-width="20" stroke-linecap="round">
        <circle cx="196" cy="176" r="26"/><circle cx="196" cy="336" r="26"/><circle cx="316" cy="336" r="26"/>
        <path d="M196 202 V 310 M316 310 V 240 C 316 210, 296 196, 266 196 H 236"/>
        <path d="M256 172 L 230 196 L 256 220"/>
      </g>'''),
}

# pixel art: a little flame in led cells, the one glyph that is its own subject
def pixels():
    rows = ['...x...', '..xx...', '..xxx..', '.xxyxx.', '.xyyyx.', 'xxywyxx', 'xyywyyx']
    col = {'x': '#fb923c', 'y': '#fde047', 'w': '#fff7d6'}
    s, cell, x0, y0 = [], 30, 256 - 3.5 * 30, 256 - 3.5 * 30
    for r, row in enumerate(rows):
        for c, ch in enumerate(row):
            fill = col.get(ch, '#2a2230')
            s.append(f'<rect x="{x0 + c*cell + 3}" y="{y0 + r*cell + 3}" width="{cell-6}" height="{cell-6}" rx="4" fill="{fill}"/>')
    return '\n'.join(s)

def svg(accent, glyph):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="{accent}" stop-opacity=".22"/>
      <stop offset=".6" stop-color="#0b0b12" stop-opacity="0"/></radialGradient>
    <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.6" fill="#ffffff" opacity=".07"/></pattern>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" fill="#0b0b12"/><rect width="512" height="512" fill="url(#dots)"/><rect width="512" height="512" fill="url(#bg)"/>
  <g filter="url(#glow)">
    <path d="M 451.7 143 A 226 226 0 1 1 369 60.3" fill="none" stroke="{accent}" stroke-width="34" stroke-linecap="round"/>
    <circle cx="415.8" cy="96.2" r="20" fill="{accent}"/>
    <g transform="translate(256 256) scale(1.314) translate(-256 -256)">{glyph}</g>
  </g>
</svg>'''

os.makedirs(OUT, exist_ok=True)
for slug, (accent, glyph) in G.items():
    body = svg(accent, (glyph or pixels()).replace('"C"', f'"{accent}"'))
    html = os.path.join(OUT, slug + '.html')
    open(html, 'w').write(f'<html><body style="margin:0;background:#0b0b12">{body}</body></html>')
    subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars', '--window-size=512,512',
                    f'--screenshot={os.path.join(OUT, slug + ".png")}', 'file://' + html],
                   check=True, capture_output=True)
    png = os.path.join(OUT, slug + '.png')
    public = os.path.join(ROOT, 'apps', slug, 'public')
    # a new app has no icon yet, so it gets a png
    icon = next((f for f in os.listdir(public) if f.startswith('icon.')), 'icon.png')
    fmt = ['-s', 'format', 'jpeg', '-s', 'formatOptions', '90'] if icon.endswith('.jpg') else []
    subprocess.run(['sips', '-Z', '256', *fmt, png, '--out', os.path.join(public, icon)], check=True, capture_output=True)
    size = os.path.getsize(os.path.join(public, icon))
    assert size < 64 * 1024, f'{slug} icon is {size} bytes, over the 64 KiB limit'
    print(f'{slug:16} {size / 1024:5.1f} KiB')
