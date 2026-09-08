import os,json,urllib.request,urllib.error,concurrent.futures
from pathlib import Path
out=Path('public/audio');out.mkdir(exist_ok=True)
items=[('music',60,'Instrumental sci-fi arcade racing soundtrack. 128 BPM driving breakbeats, punchy bass, bright arpeggiated analog synths, expansive space atmosphere, playful danger and forward momentum. Clean game mix, no vocals, no long intro, steady pulse throughout, loop-friendly ending.'),('engine',5,'Seamless loop of a small futuristic four wheel ATV engine idling at medium revs, gritty mechanical motor and quiet electric whine, steady pitch, isolated, no music.'),('rifle',1,'One powerful futuristic precision sniper rifle shot, sharp metallic crack followed by a short electric tail. Single isolated shot, immediate attack, no music.'),('rocket',2,'Single futuristic rocket launcher discharge, hollow mechanical thump followed by a powerful brief rocket whoosh. Immediate attack, isolated, no music.'),('explosion',3,'Single explosive fuel barrel detonation, deep punchy blast with metallic fragments tumbling and short rumbling decay. Immediate onset. Isolated video game effect, no music.'),('boost',2,'Arcade speed boost pickup, immediate rising electric turbine whoosh and bright energy surge, exhilarating, short isolated game effect, no music.'),('reload',2.4,'Sci-fi rifle reload sequence, magazine click out, firm metallic insertion, charging handle cock and satisfying final lock. Isolated close mechanical sounds, no gunshot, no music.'),('barrel',1,'Empty metal drum hit hard, single hollow clang then a short rattle as it tumbles. Immediate onset, isolated game effect, no music.'),('checkpoint',1.4,'Bright sci-fi racing checkpoint confirmation, three ascending crystalline electronic notes with a satisfying short shimmer, isolated interface sound.')]
def generate(item):
 name,duration,prompt=item;p=out/(name+'.mp3')
 if p.exists():return {'name':name,'status':'existing','bytes':p.stat().st_size}
 body={'prompt':prompt,'music_length_ms':int(duration*1000),'force_instrumental':True} if name=='music' else {'text':prompt,'duration_seconds':duration,'prompt_influence':.5,'loop':name=='engine'}
 req=urllib.request.Request('https://api.elevenlabs.io/v1/'+('music' if name=='music' else 'sound-generation'),data=json.dumps(body).encode(),headers={'xi-api-key':os.environ['ELEVENLABS_API_KEY'],'Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=240) as r: audio=r.read();request_id=r.headers.get('request-id');ctype=r.headers.get('Content-Type','')
  if 'audio' not in ctype:raise ValueError('Unexpected response type '+ctype)
  p.write_bytes(audio);result={'name':name,'status':'generated','bytes':len(audio),'requestId':request_id,'prompt':prompt,'requestedSeconds':duration}
 except urllib.error.HTTPError as e:result={'name':name,'status':'failed','http':e.code,'error':e.read().decode()[:700]}
 except Exception as e:result={'name':name,'status':'failed','error':str(e)}
 print(json.dumps({k:v for k,v in result.items() if k!='prompt'}),flush=True);return result
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:results=list(pool.map(generate,items))
reports=Path('work/reports');reports.mkdir(parents=True,exist_ok=True)
(reports/'audio-generation.json').write_text(json.dumps({'provider':'ElevenLabs','assets':results},indent=2)+'\n')
