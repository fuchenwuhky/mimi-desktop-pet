"""Package approved generated artwork and final-byte previews."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,shutil
ROOT=Path(__file__).parent
ASSETS=ROOT.parents[1]/'assets'/'pet'
ASSETS.mkdir(parents=True,exist_ok=True)
states=['idle','running-right','running-left','waving','jumping','failed','waiting','running','review']
counts=[6,8,8,4,5,8,6,6,6]
atlas=Image.open(ROOT/'final'/'spritesheet-extended.png').convert('RGBA')
for row,(state,count) in enumerate(zip(states,counts)):
    folder=ROOT/'final'/'frames'/state;folder.mkdir(parents=True,exist_ok=True)
    for col in range(count):atlas.crop((192*col,208*row,192*(col+1),208*(row+1))).save(folder/f'{col:02}.png')
shutil.copy2(ROOT/'frames'/'frames-manifest.json',ROOT/'final'/'frames'/'frames-manifest.json')
shutil.copy2(ROOT/'final'/'spritesheet-extended.png',ASSETS/'spritesheet.png')
for state in ['transitions','loaf']:
    strip=Image.new('RGBA',(1536,208))
    for i,p in enumerate(sorted((ROOT/'frames'/state).glob('*.png'))):strip.alpha_composite(Image.open(p),(192*i,0))
    strip.save(ROOT/'final'/f'{state}-raw.png')
names=['idle','runRight','runLeft','waving','jumping','failed','waiting','running','review']
fps=[3.2,16,16,5,6,5,3.2,4.5,4]
animations={name:{'row':i,'frames':count,'fps':rate,'loop':name not in ['waving','jumping','failed']} for i,(name,count,rate) in enumerate(zip(names,counts,fps))}
animations.update({
 'settle':{'sheet':'transitions.png','row':0,'frames':6,'fps':9,'loop':False},
 'rise':{'sheet':'transitions.png','row':0,'frames':6,'fps':9,'loop':False,'reverse':True},
 'standToRun':{'sheet':'transitions.png','row':0,'frames':3,'fps':9,'loop':False},
 'runToStand':{'sheet':'transitions.png','row':0,'frames':3,'fps':9,'loop':False,'reverse':True},
 'loaf':{'sheet':'loaf.png','row':0,'frames':4,'fps':1.5,'loop':True}
})
manifest={'name':'小咪','id':'mimi','version':1,'spriteVersionNumber':2,'sheet':'spritesheet.png','cell':{'width':192,'height':208},'columns':8,'rows':11,'groundY':184,'animations':animations,'look':{'startRow':9,'frames':16},'artwork':{'style':'painterly','source':'built-in imagegen, grounded in 13 user cat photos','registration':'row-wide anatomical scale calibration; fixed stage and ground; never per-frame fit'}}
(ASSETS/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
labels=['000','022.5','045','067.5','090','112.5','135','157.5','180','202.5','225','247.5','270','292.5','315','337.5']
expected=['up','up-right','up-right','up-right','right','down-right','down-right','down-right','down','down-left','down-left','down-left','left','up-left','up-left','up-left']
evidence=[
 'Chin lifted, nostrils visible under raised nose; both blue eyes point above face center.',
 'Nose rises toward upper right; raised chin and visible screen-right-facing muzzle supply both axes.',
 'Head yaw and blue eye face right; raised nose and chin preserve upward pitch. Similar to preceding angle but no reversal.',
 'Nose tip points to right edge while chin remains subtly raised; pupil is on upper right of eye surface.',
 'Clear right profile with nose and blue eye on screen-right of ear/cheek center; torso remains seated front.',
 'Right profile begins to bow, muzzle and pupil point slightly below the prior right cardinal.',
 'Nose points down and right, crown visible, chin sinks into screen-right chest.',
 'Head is bowed steeply; nose remains on screen-right of skull center and points toward right forepaw.',
 'Both ears flatten with bowed crown; centered nose and eyes aim down between planted forepaws.',
 'Bowed nose shifts left of crown, both gaze and muzzle aim to lower-left paw.',
 'Left muzzle is visible while crown faces viewer; nose and pupil are below head center.',
 'Head turns left with slight downward chin pitch; gaze stays below the horizontal left cardinal.',
 'Clear left profile, nose and blue eye on screen-left side of cheek and ear; seated body remains fixed.',
 'Left profile begins upward chin lift; blue eye and nose tip point above left edge.',
 'Nose is angled upper-left with lifted chin and visible underside of muzzle.',
 'Chin strongly raised, eyes aim nearly upward but muzzle remains slightly left; flows into up cardinal.'
]
records={label:{'expected':exp,'observed':exp,'verdict':'warning' if label in ['022.5','045'] else 'pass','evidence':ev} for label,exp,ev in zip(labels,expected,evidence)}
(ROOT/'qa'/'direction-semantics.json').write_text(json.dumps({'directions':records,'review':'Labeled native-size and zoom review of exact encoded final atlas; all four cardinals unambiguous; minor near-up adjacent similarity.'},indent=2),encoding='utf-8')
print(ASSETS)
