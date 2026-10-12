from pathlib import Path
from PIL import Image, ImageDraw
import sys, math, json
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from skill_runtime import enable_skill_scripts
enable_skill_scripts()
from extract_strip_frames import remove_chroma_background, component_frame_groups, fit_registered_component_groups, connected_components
root=Path(__file__).parent.parent
for state,n in [('transitions',12),('jumping',10)]:
    im=remove_chroma_background(Image.open(root/'decoded'/f'{state}.png'),(255,0,255),130)
    groups=component_frame_groups(im,n)
    frames=fit_registered_component_groups(im,groups)
    contact=Image.new('RGB',(192*6,238*2),'#eeeae5'); d=ImageDraw.Draw(contact)
    landmarks=[]
    for i,f in enumerate(frames):
        eye=Image.new('RGBA',f.size)
        eye.putdata([(255,255,255,255) if b>r+12 and g>r+6 and b>=g and a>120 else (0,0,0,0) for r,g,b,a in f.getdata()])
        parts=sorted(connected_components(eye),key=lambda c:c['area'],reverse=True)[:2]
        ps=[((c['bbox'][0]+c['bbox'][2])/2,(c['bbox'][1]+c['bbox'][3])/2) for c in parts]
        landmarks.append({'frame':i,'eyes':ps,'distance':math.dist(*ps) if len(ps)==2 else None,'bbox':f.getbbox()})
        x=(i%6)*192;y=(i//6)*238
        contact.paste(f,(x,y),f);d.text((x+5,y+211),str(i),fill='black')
    contact.save(root/'qa'/f'{state}-inspection.jpg')
    (root/'qa'/f'{state}-landmarks.json').write_text(json.dumps(landmarks,indent=2),encoding='utf-8')
    print(state, [(x['frame'],round(x['distance'],2) if x['distance'] else None) for x in landmarks])
