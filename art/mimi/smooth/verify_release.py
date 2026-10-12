"""Check the exact shipped PNG bytes, all clip cells and transition endpoints."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib,math,sys
ROOT=Path(__file__).parent
sys.path.insert(0, str(ROOT.parent))
from skill_runtime import preview_font
ASSETS=ROOT.parents[2]/'assets'/'pet'
m=json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
sheets={p.name:Image.open(p).convert('RGBA') for p in ASSETS.glob('*.png')}
errors=[];records=[]

def frames(name):
    a=m['animations'][name];im=sheets[a.get('sheet',m['sheet'])]
    indices=list(range(a['frames']))
    if a.get('reverse'):indices.reverse()
    result=[]
    for index in indices:
        absolute=a['row']*8+a.get('startColumn',0)+index
        x=(absolute%8)*192;y=(absolute//8)*208
        if x+192>im.width or y+208>im.height:errors.append(f'{name}/{index}: out of sheet')
        result.append(im.crop((x,y,x+192,y+208)))
    return result

for name,a in m['animations'].items():
    fs=frames(name);boxes=[];hashes=[]
    for i,f in enumerate(fs):
        box=f.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
        if not box:errors.append(f'{name}/{i}: empty')
        elif min(box[0],box[1],192-box[2],208-box[3])<3:errors.append(f'{name}/{i}: clipping {box}')
        boxes.append(box);hashes.append(hashlib.sha256(f.tobytes()).hexdigest())
    records.append({'animation':name,'frames':len(fs),'distinct_encoded_frames':len(set(hashes)),'duration_ms':round(len(fs)*1000/a['fps']),'bounds':boxes})
    # Transparent previews preserve the exact fixed cell, never resize bounds.
    out=ROOT.parent/'previews'/'smooth'/f'{name}.gif'
    fs[0].save(out,save_all=True,append_images=fs[1:],duration=[round(1000/a['fps']/10)*10]*len(fs),loop=0,disposal=2,optimize=False)

compat_sha=hashlib.sha256((ASSETS/'spritesheet.png').read_bytes()).hexdigest()
if compat_sha!='452c4fa1cbed2b83c4bd46668b6528d02a20aeeef403462243ec537a0b6a60e8':errors.append('Compatibility atlas changed')
# Semantic preservation: jump must actually lift, then return near baseline.
jump=next(r for r in records if r['animation']=='jumping')['bounds']
lift=jump[0][3]-min(b[3] for b in jump)
if lift<15:errors.append('Jump has insufficient actual lift')
if abs(jump[0][3]-jump[-1][3])>4:errors.append('Jump landing baseline changed')
transition=frames('settle')[-1];loaf=frames('loaf')[0]
tb=transition.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
lb=loaf.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
if abs(tb[1]-lb[1])>4 or abs(tb[3]-lb[3])>4:errors.append('Loaf transition endpoint jumps')
report={'ok':not errors,'errors':errors,'desktop_frames':130,'compatibility_sha256':compat_sha,'jump_lift_px':lift,'jump_landing_delta_px':jump[-1][3]-jump[0][3],'loaf_endpoint':{'bridge':tb,'rest':lb},'animations':records,'visual_policy':'Final-cell contact sheet, source motion review, stable 192x208 canvas and one transform per complete clip.'}
(ROOT/'qa'/'release-validation.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

names=['idle','running','waiting','review','waving','jumping','failed','standToRun','runRight','runToStand','settle','loaf']
font=preview_font(15)
contact=Image.new('RGB',(6*288,2*342),'#e5ebe7');d=ImageDraw.Draw(contact)
for j,name in enumerate(names):
    x=j%6*288;y=j//6*342
    frame=frames(name)[0].resize((288,312),Image.Resampling.NEAREST)
    contact.paste(frame,(x,y+25),frame);d.text((x+10,y+3),name,font=font,fill='#304539')
contact.save(ROOT/'qa'/'state-size-controls.png')
print(json.dumps({k:report[k] for k in ['ok','errors','desktop_frames','jump_lift_px','jump_landing_delta_px','loaf_endpoint']},indent=2))
if errors:raise SystemExit(1)
