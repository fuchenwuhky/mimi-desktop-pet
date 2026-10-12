"""Deterministic registration of generated pixels. No drawing or per-frame fitting.

Uses the skill's extracted connected pose groups, one scale for each complete
animation row, a shared physical head reference and a common ground anchor.
Original generated imagery and raw extraction remain untouched for comparison.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import sys, json, math
ROOT = Path(__file__).parent
from skill_runtime import enable_skill_scripts
SKILL = enable_skill_scripts()
from extract_strip_frames import connected_components
STATES = ['idle','running-right','running-left','waving','jumping','failed','waiting','running','review']

def eyes(im):
    mask = Image.new('RGBA', im.size)
    pix = []
    for y in range(im.height):
        for x in range(im.width):
            r,g,b,a = im.getpixel((x,y))
            pix.append((255,255,255,255) if b>r+12 and g>r+6 and b>=g and a>120 and y<150 else (0,0,0,0))
    mask.putdata(pix)
    parts=sorted(connected_components(mask), key=lambda c:c['area'], reverse=True)[:2]
    if len(parts)!=2 or min(c['area'] for c in parts)<5:
        raise ValueError('Need two visible blue iris landmarks for neutral calibration')
    points=[((c['bbox'][0]+c['bbox'][2])/2,(c['bbox'][1]+c['bbox'][3])/2) for c in parts]
    return points, math.dist(*points)

def ground(im, x):
    hits=[]
    for xx in range(max(0,round(x)-16),min(im.width,round(x)+17)):
        ys=[y for y in range(100,im.height) if im.getpixel((xx,y))[3]>160]
        if ys: hits.append(max(ys)+1)
    return max(hits)

def register(name, source, target):
    files=sorted(source.glob('[0-9][0-9].png'))
    frames=[Image.open(p).convert('RGBA') for p in files]
    if name in ['running-right','running-left']:
        scale=1.0; root_x=96; ground_y=max(im.getbbox()[3] for im in frames)
        measured={'reference':'Profile skull ~34 px ear-to-nose; preserved approved gait scale.'}
    else:
        # Neutral/control frame only. Blink/turn/jump frames keep EXACTLY this scale.
        control = frames[-1] if name=='jumping' else frames[0]
        points,distance=eyes(control)
        scale=15.0/distance
        root_x=sum(p[0] for p in points)/2
        ground_y=ground(control,root_x)
        measured={'iris_centers':points,'iris_distance_before':distance,'iris_distance_after':15.0}
    target.mkdir(parents=True,exist_ok=True)
    for i,im in enumerate(frames):
        size=(round(192*scale),round(208*scale))
        transformed=im.resize(size,Image.Resampling.LANCZOS)
        x=round(96-root_x*scale); y=round(184-ground_y*scale)
        out=Image.new('RGBA',(192,208))
        out.alpha_composite(transformed,(x,y))
        box=out.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
        if not box or min(box[0],box[1],192-box[2],208-box[3])<3:
            raise ValueError(f'{name}/{i}: clipping after shared registration: {box}')
        out.save(target/f'{i:02}.png')
    return {'state':name,'scale':scale,'source_root_x':root_x,'source_ground_y':ground_y,'target_root_x':96,'target_ground_y':184,'transform_policy':'one uniform scale and translation per whole row; no per-frame resizing','landmarks':measured,'frames':len(frames),'method':'components'}

records=[]
for state in STATES:
    records.append(register(state,ROOT/'qa'/'rows'/state/'frames'/state,ROOT/'frames'/state))
for state,alias in [('transitions','waiting'),('loaf','waving')]:
    records.append(register(state,ROOT/'qa'/'extras'/state/alias,ROOT/'frames'/state))
out=ROOT/'qa'/'body-registration.json'
out.write_text(json.dumps({'method':'Blue iris landmarks on neutral control pose; profile gait skull as physical reference. Every row keeps its complete shared transform.','rows':records},ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'frames'/'frames-manifest.json').write_text(json.dumps({'ok':True,'rows':records[:9]},indent=2),encoding='utf-8')
canvas=Image.new('RGB',(8*192,11*232),'#b5c5c2');d=ImageDraw.Draw(canvas)
for i,state in enumerate(STATES+['transitions','loaf']):
    d.text((8,i*232+4),state,fill='#273936')
    for j,p in enumerate(sorted((ROOT/'frames'/state).glob('*.png'))):
        im=Image.open(p);canvas.paste(im,(j*192,i*232+24),im)
    d.line((0,i*232+208,1536,i*232+208),fill='#91a6a0')
canvas.save(ROOT/'qa'/'registered-rows.png')
print(json.dumps({'rows':[{k:r[k] for k in ['state','scale','source_ground_y']} for r in records],'report':str(out)},indent=2))
