"""Assemble higher-frame desktop clips from generated art using bundled extraction.

The validated fixed-layout v2 compatibility atlas is deliberately preserved.
No pet pixels are drawn or morphed here. Every clip uses one common scale.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps
import sys, json, math, subprocess, hashlib

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT.parent))
from skill_runtime import enable_skill_scripts
SKILL = enable_skill_scripts()
from extract_strip_frames import remove_chroma_background, connected_components, component_frame_groups, fit_registered_component_groups, component_bounds

COUNTS = {'idle':12,'running':12,'running-right':16,'jumping':10,'transitions':12,'waving':8,'loaf':8}

def eyes(im):
    mask=Image.new('RGBA',im.size)
    mask.putdata([(255,255,255,255) if b>r+10 and g>r+5 and b>=g and a>120 and i//im.width<170 else (0,0,0,0) for i,(r,g,b,a) in enumerate(im.getdata())])
    parts=sorted(connected_components(mask),key=lambda c:c['area'],reverse=True)[:2]
    if len(parts)!=2 or min(p['area'] for p in parts)<3:return None
    points=[((p['bbox'][0]+p['bbox'][2])/2,(p['bbox'][1]+p['bbox'][3])/2) for p in parts]
    return {'points':points,'distance':math.dist(*points)}

def extract(name):
    n=COUNTS[name]
    source=Image.open(ROOT/'decoded'/f'{name}.png')
    rgba=remove_chroma_background(source,(255,0,255),96)
    components=connected_components(rgba)
    maximum=max(c['area'] for c in components)
    large=[c for c in components if c['area']>=maximum*.20]
    if len(large)!=n:raise ValueError(f'{name}: {len(large)} complete components, expected {n}')
    groups=component_frame_groups(rgba,n)
    frames=fit_registered_component_groups(rgba,groups)
    folder=ROOT/'extracted'/name;folder.mkdir(parents=True,exist_ok=True)
    report=[]
    for i,im in enumerate(frames):
        im.save(folder/f'{i:02}.png')
        report.append({'frame':i,'source_bounds':component_bounds(groups[i]),'bounds':im.getbbox(),'eyes':eyes(im)})
    (ROOT/'qa'/f'{name}-extraction.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return frames,report

def register(name,frames,report):
    control=frames[1] if name=='transitions' else frames[0]
    measured=eyes(control)
    if name=='running-right':
        # Profile ear-to-muzzle is ~29 px before this common transform; match
        # the approved ~33 px skull and keep the extended stride inside 192 px.
        scale=1.14;root_x=96;ground_y=max(im.getbbox()[3] for im in frames)
        measured={'reference':'Approved side-profile skull and longest stride; one shared 1.14 scale.'}
    else:
        if measured is None:raise ValueError(f'{name}: neutral iris landmarks unavailable')
        scale=15/measured['distance']
        # Neutral full-body controls in these two sources are slightly taller
        # at the same iris spacing. A single anatomical calibration for the
        # whole row keeps ear-to-ground height within the seated family.
        if name in ['jumping','waving']:scale *= .95
        root_x=sum(p[0] for p in measured['points'])/2
        if name=='transitions':
            # Use the neutral first frame for the seated root, the second frame
            # only for clearer blue iris color calibration.
            initial=eyes(frames[0])
            if initial:root_x=sum(p[0] for p in initial['points'])/2
        ground_y=max(y+1 for x in range(max(0,round(root_x)-16),min(192,round(root_x)+17)) for y in range(100,208) if control.getpixel((x,y))[3]>160)
    target=ROOT/'registered'/name;target.mkdir(parents=True,exist_ok=True)
    output=[]
    for i,im in enumerate(frames):
        out=Image.new('RGBA',(192,208))
        resized=im.resize((round(192*scale),round(208*scale)),Image.Resampling.LANCZOS)
        out.alpha_composite(resized,(round(96-root_x*scale),round(184-ground_y*scale)))
        box=out.getchannel('A').point(lambda a:255 if a>16 else 0).getbbox()
        if box is None or min(box[0],box[1],192-box[2],208-box[3])<3:raise ValueError(f'{name}/{i}: clipping {box}')
        out.save(target/f'{i:02}.png');output.append(out)
    return output,{'state':name,'frames':len(output),'scale':scale,'root_x':root_x,'ground_y':ground_y,'target_ground':184,'landmarks':measured,'policy':'one fixed uniform transform across entire clip'}

def sheet(name,frames):
    raw=ROOT/'sheets'/f'{name}-raw.png';raw.parent.mkdir(parents=True,exist_ok=True)
    dest=ROOT/'sheets'/f'{name}.png'
    im=Image.new('RGBA',(1536,208*math.ceil(len(frames)/8)))
    for i,f in enumerate(frames):im.alpha_composite(f,((i%8)*192,(i//8)*208))
    im.save(raw)
    subprocess.run([sys.executable,str(SKILL/'despill_chroma_edges.py'),str(raw),'--output',str(dest),'--json-out',str(ROOT/'qa'/f'{name}-despill.json'),'--chroma-key','#FF00FF','--spill-tolerance','0.6','--minimum-saturation','0.03','--edge-radius','7'],check=True,stdout=subprocess.DEVNULL)
    return dest

def main():
    names=sys.argv[1:] or [name for name in COUNTS if (ROOT/'decoded'/f'{name}.png').exists()]
    results=[]
    for name in names:
        frames,report=extract(name)
        registered,record=register(name,frames,report)
        path=sheet(name,registered)
        record['sheet']=path.relative_to(ROOT).as_posix();record['sha256']=hashlib.sha256(path.read_bytes()).hexdigest();results.append(record)
        print(json.dumps(record,ensure_ascii=False))
        if name=='running-right':
            path=sheet('running-left',[ImageOps.mirror(f) for f in registered])
    oldpath=ROOT/'qa'/'registration.json'
    records=json.loads(oldpath.read_text(encoding='utf-8')) if oldpath.exists() else []
    records=[r for r in records if r['state'] not in names]+results
    oldpath.write_text(json.dumps(records,indent=2),encoding='utf-8')
    # Contact only final encoded pixels, one constant cell with a ground guide.
    contact=Image.new('RGB',(1536,len(records)*440),'#e5ebe7');draw=ImageDraw.Draw(contact)
    for j,r in enumerate(records):
        draw.text((8,j*440+3),r['state'],fill='#234236')
        # Historical reports may contain the original workstation's path.
        # Resolve by state within this checkout, including a partial rebuild.
        sprite=Image.open(ROOT/'sheets'/f"{r['state']}.png");contact.paste(sprite,(0,j*440+24),sprite)
    contact.save(ROOT/'qa'/'registered-contact.png')

if __name__=='__main__':main()
