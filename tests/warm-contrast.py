"""Report every warm design text/background token pairing, no dependencies."""
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
css=(ROOT/'assets/warm.css').read_text()
def luminance(color):
    rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)]
    linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    return sum(a*b for a,b in zip(linear,(.2126,.7152,.0722)))
def ratio(a,b):
    x,y=sorted((luminance(a),luminance(b)))
    return (y+.05)/(x+.05)
light=dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{6})',re.search(r':root\{([^}]+)',css)[1]))
dark=light|dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{6})',re.search(r':root\[data-theme=dark\]\{([^}]+)',css)[1]))
for name,t in [('Light',light),('Dark',dark)]:
    backgrounds=['bg','bg-top','surface','surface-cream','fill-warm','section-tint','accent-tint']
    for fg in ['ink','ink-muted','same','different','accent-on-tint']:
        for bg in backgrounds:
            value=ratio(t[fg],t[bg]);assert value>=4.5,(name,fg,bg,value)
            print(f'{name} {fg}/{bg}: {value:.2f}:1 AA')
    for bg in ['bg','surface']:
        value=ratio(t['accent-text'],t[bg]);assert value>=4.5
        print(f'{name} accent-text/{bg}: {value:.2f}:1 AA')
    for bg in ['bg','bg-top','surface']:
        value=ratio(t['accent-display'],t[bg]);assert value>=3
        print(f'{name} accent-display/{bg}: {value:.2f}:1 AA LARGE ONLY')
    for bg in backgrounds:
        for fg in ['focus','control-border']:
            value=ratio(t[fg],t[bg]);assert value>=3
            print(f'{name} {fg}/{bg}: {value:.2f}:1 non-text')
    value=ratio('#FFFFFF',t['dark-surface']);assert value>=4.5
    print(f'{name} white/dark-surface: {value:.2f}:1 AA')
    print(f'{name} charcoal/accent: {ratio("#36322F",t["accent"]):.2f}:1 AA')
print('UNVERIFIED: actual rendered contrast, screen readers and full WCAG conformance.')
