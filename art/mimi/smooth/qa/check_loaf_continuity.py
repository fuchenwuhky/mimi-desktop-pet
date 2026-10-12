import importlib.util, json, sys
from PIL import Image, ImageDraw
from pathlib import Path
ROOT=Path(__file__).parent.parent
spec=importlib.util.spec_from_file_location('build_smooth',ROOT/'build_smooth.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
frames=b.fit_registered_component_groups(b.remove_chroma_background(Image.open(ROOT/'decoded/loaf.png'),(255,0,255),96),b.component_frame_groups(b.remove_chroma_background(Image.open(ROOT/'decoded/loaf.png'),(255,0,255),96),8))
control=frames[0]; measured=b.eyes(control); scale=15/measured['distance'];rx=sum(p[0] for p in measured['points'])/2
gy=max(y+1 for x in range(max(0,round(rx)-16),min(192,round(rx)+17)) for y in range(100,208) if control.getpixel((x,y))[3]>160)
out=Image.new('RGBA',(192,208));out.alpha_composite(control.resize((round(192*scale),round(208*scale)),Image.Resampling.LANCZOS),(round(96-rx*scale),round(184-gy*scale)))
anchor=Image.open(ROOT/'registered/transitions/11.png').convert('RGBA')
qa=Image.new('RGB',(576,238),'#e6ebe7');draw=ImageDraw.Draw(qa)
for i,(im,name) in enumerate([(anchor,'Bridge frame11'),(out,'New loaf frame0'),(Image.open(ROOT/'registered/loaf/00.png'),'Previous loaf')]):
    qa.paste(im,(i*192,0),im);draw.text((i*192+5,215),name,fill='black')
qa.save(ROOT/'qa/loaf-continuity-comparison.jpg')
report={'bridgeBounds':anchor.getbbox(),'newLoafBounds':out.getbbox(),'newLoafEyeMeasure':measured,'newLoafScale':scale,'bridgeEyes':b.eyes(anchor),'newLoafEyes':b.eyes(out)}
(ROOT/'qa/loaf-continuity-repair.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
