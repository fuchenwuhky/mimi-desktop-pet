import sys, json
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from skill_runtime import enable_skill_scripts
enable_skill_scripts()
from extract_strip_frames import remove_chroma_background, connected_components, component_frame_groups
for name in sys.argv[1:]:
    p=Path(name); im=remove_chroma_background(Image.open(p), (255,0,255), 130)
    cs=connected_components(im)
    large=sorted([c for c in cs if c['area']>200], key=lambda c:c['center_x'])
    output={'file':str(p),'size':im.size,'largeComponentCount':len(large),'components':[{'bbox':c['bbox'],'area':c['area']} for c in large]}
    print(json.dumps(output))
    (p.parent.parent/'qa'/(p.stem+'-components.json')).write_text(json.dumps(output,indent=2),encoding='utf-8')
