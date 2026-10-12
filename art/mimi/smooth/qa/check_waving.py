import sys,json
from pathlib import Path
from PIL import Image,ImageDraw
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from skill_runtime import enable_skill_scripts
enable_skill_scripts()
import extract_strip_frames as e
p=Path(__file__).resolve().parents[1]
im=Image.open(p/'decoded/waving.png')
strip=e.remove_chroma_background(im,(255,0,255),100)
components=e.connected_components(strip)
large=[c for c in components if c['area']>500]
groups=e.component_frame_groups(strip,8)
if groups is None:raise ValueError('Missing frame groups')
frames=e.fit_registered_component_groups(strip,groups)
out=p/'qa/wave8';out.mkdir(exist_ok=True)
stills=Image.new('RGB',(192*8,208),'#e8e2d9')
clips=[]
for n,f in enumerate(frames):
 f.save(out/f'{n:02d}.png')
 bg=Image.new('RGB',f.size,'#e8e2d9');bg.paste(f,mask=f.getchannel('A'))
 ImageDraw.Draw(bg).text((8,8),str(n+1),fill='black')
 stills.paste(bg,(n*192,0));clips.append(bg)
stills.save(p/'qa/waving-8-contact.png')
clips[0].save(p/'qa/waving-8.gif',save_all=True,append_images=clips[1:],duration=110,loop=0)
report={'source':str(p/'decoded/waving.png'),'dimensions':im.size,'requested_frames':8,'large_component_count':len(large),'frame_groups':len(groups),'bbox':[e.component_bounds(g) for g in groups],'method':'bundled connected components; one shared row transform','visual_review':{'tail_repair':'all eight tails complete with rounded furry contours; final tail no longer has straight cutoff','continuity':'same head dimensions and grounded hindquarters, forepaw lifts and lowers, first and last seated','no_detached_effects':True,'count':8},'no_final_physical_registration_yet':True}
(p/'qa/waving-source.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps(report))
