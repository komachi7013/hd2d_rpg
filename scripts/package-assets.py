"""Preserve generated sources and publish only runtime images. Use .venv/bin/python."""
from pathlib import Path
from PIL import Image
import shutil
import importlib.util
import sys
spec=importlib.util.spec_from_file_location('sprite_processor', '.codex/skills/generate2dsprite/scripts/generate2dsprite.py')
processor=importlib.util.module_from_spec(spec)
sys.modules[spec.name]=processor
spec.loader.exec_module(processor)
public=Path('public/assets');archive=Path('art-source');archive.mkdir(exist_ok=True)
for actor in ['yuu','lilia']:
    folder=public/actor
    if not (folder/f'player_sheet-1.png').exists():continue
    for row,direction in enumerate(['down','left','right','up']):
        frames=[Image.open(folder/f'player_sheet-{row*4+i+1}.png').convert('RGBA') for i in range(4)]
        strip=Image.new('RGBA',(512,128))
        for i,frame in enumerate(frames):strip.paste(frame,(i*128,0))
        strip.save(folder/f'{direction}-strip.png')
        processor.save_transparent_gif(frames,folder/f'{direction}.gif',140)
for source in list(public.iterdir()):
    if source.is_dir():
        target=archive/source.name
        if target.exists():continue
        shutil.move(source,target)
        source.mkdir()
        shutil.copy2(target/'sheet-transparent.png',source/'sheet-transparent.png')
    elif 'raw' in source.stem or 'profile' in source.stem or 'anchor' in source.stem:
        shutil.move(source,archive/source.name)
print('Runtime sheets kept in public/assets; original images, GIFs, frames and QC in art-source.')
