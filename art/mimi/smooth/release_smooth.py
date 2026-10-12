"""Export extra desktop sheets without altering the validated compatibility PNG."""
from pathlib import Path
import json, shutil, hashlib
ROOT=Path(__file__).parent
ASSETS=ROOT.parents[2]/'assets'/'pet'
backup=ASSETS/'manifest-compatibility.json'
if not backup.exists():shutil.copy2(ASSETS/'manifest.json',backup)
m=json.loads(backup.read_text(encoding='utf-8'))
for name in ['idle','running-right','running-left','running','jumping','waving','transitions','loaf']:
    shutil.copy2(ROOT/'sheets'/f'{name}.png',ASSETS/f'smooth-{name}.png')
updates={'idle':('idle',12,6.4),'runRight':('running-right',16,32),'runLeft':('running-left',16,32),'running':('running',12,9),'jumping':('jumping',10,12),'waving':('waving',8,10),'loaf':('loaf',8,3)}
for name,(sheet,frames,fps) in updates.items():
    m['animations'][name].update({'sheet':f'smooth-{sheet}.png','row':0,'frames':frames,'fps':fps})
for name in ['settle','rise','standToRun','runToStand']:
    m['animations'][name].update({'sheet':'smooth-transitions.png','row':0,'frames':5 if name in ['standToRun','runToStand'] else 12,'fps':18})
m['version']=2
m['artwork']['desktopFrameCount']=130
m['artwork']['compatibilityFrameCount']=83
m['artwork']['extraFrames']='Genuine additional generated poses in independent sheets; fixed-layout v2 atlas retained separately.'
(ASSETS/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'assets':str(ASSETS),'frames':130,'compatibilitySha256':hashlib.sha256((ASSETS/'spritesheet.png').read_bytes()).hexdigest()},indent=2))
