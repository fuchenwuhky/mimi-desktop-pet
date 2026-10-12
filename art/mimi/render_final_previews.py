"""Preview only actual final encoded sprite pixels, at a fixed stage transform."""
from PIL import Image,ImageDraw,ImageFont
from pathlib import Path
import json,sys
from skill_runtime import preview_font
ROOT=Path(__file__).parent
ASSETS=ROOT.parents[1]/'assets'/'pet'
OUT=ROOT/'previews'/(sys.argv[1] if len(sys.argv)>1 else 'final');OUT.mkdir(parents=True,exist_ok=True)
m=json.loads((ASSETS/'manifest.json').read_text(encoding='utf-8'))
sheets={p.name:Image.open(p).convert('RGBA') for p in ASSETS.glob('*.png')}
font=preview_font(20, chinese=True)
small=preview_font(13, chinese=True)
labels={'idle':'偷偷陪你','running':'认真踩踩 · 正在工作','waiting':'咪……等你点头','review':'再偷偷检查一遍','waving':'咪。（勇气已用完）','jumping':'吓了一小跳','failed':'慢慢来，我陪你','standToRun':'被发现了 · 起身','runRight':'撒腿就跑','runLeft':'换个方向溜走','runToStand':'假装只是路过','settle':'把自己折成一团','loaf':'不是胖，是毛摊开了','rise':'重新鼓起勇气'}
def frames(name):
 a=m['animations'][name];sheet=sheets[a.get('sheet',m['sheet'])]
 indices=list(range(a.get('startColumn',0),a.get('startColumn',0)+a['frames']))
 if a.get('reverse'):indices.reverse()
 return [sheet.crop(((i%8)*192,(a['row']+i//8)*208,(i%8+1)*192,(a['row']+i//8+1)*208)) for i in indices]
def gif(images,durations,name):
 images[0].save(OUT/name,save_all=True,append_images=images[1:],duration=durations,loop=0,disposal=2,optimize=False)
native=[];times=[]
for name in ['idle','jumping','idle']:
 fs=frames(name);native+=fs;times += [round(1000/m['animations'][name]['fps'])]*len(fs)
gif(native,times,'idle-jump-idle.gif')
look=[sheets[m['sheet']].crop(((i%8)*192,(9+i//8)*208,(i%8+1)*192,(10+i//8)*208)) for i in range(16)]
gif(look,[180]*16,'look-loop.gif')
sequence=[('idle',2),('running',2),('waiting',1),('review',1),('waving',1),('jumping',1),('idle',1),('standToRun',1),('runRight',3),('runToStand',1),('idle',1),('failed',1),('settle',1),('loaf',2),('rise',1),('idle',1)]
demo=[];durations=[];stills=[];t=0
for name,cycles in sequence:
 for cycle in range(cycles):
  for idx,frame in enumerate(frames(name)):
   img=Image.new('RGB',(480,360),'#e7eeea');d=ImageDraw.Draw(img)
   d.text((24,20),'小咪 · 一点点勇气',font=font,fill='#293e37')
   d.text((24,53),labels[name],font=small,fill='#526960')
   # Exactly one constant 1.25 transform for every state; never crop to bounds.
   im=frame.resize((240,260),Image.Resampling.LANCZOS);img.paste(im,(120,66),im)
   d.line((44,296,436,296),fill='#b9cbc3')
   d.text((24,325),'固定身体标尺 · 固定落脚位置 · 完整动作过渡',font=small,fill='#627b70')
   duration=round(1000/m['animations'][name]['fps']/10)*10
   demo.append(img);durations.append(duration)
   if cycle==0 and idx==0:stills.append((name,round(t/1000,2),img.copy()))
   t+=duration
gif(demo,durations,'cross-state-demo.gif')
strip=Image.new('RGB',(480*4,390*4),'#f5f7f4');d=ImageDraw.Draw(strip)
for i,(name,t,img) in enumerate(stills):
 x=(i%4)*480;y=(i//4)*390;strip.paste(img,(x,y));d.text((x+20,y+365),f'{t:.2f}s · {name}',font=small,fill='#30493f')
strip.save(OUT/'cross-state-storyboard.jpg',quality=94)
(OUT/'timeline.json').write_text(json.dumps([{'state':n,'seconds':t} for n,t,_ in stills],ensure_ascii=False,indent=2),encoding='utf-8')
print(str(OUT))
