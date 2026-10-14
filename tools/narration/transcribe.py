"""Local reference transcript; no upload or model download."""
import argparse,json
from pathlib import Path
from generate import disable_network
disable_network()
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from faster_whisper import WhisperModel
parser=argparse.ArgumentParser()
parser.add_argument('--model',required=True)
parser.add_argument('--audio',required=True)
parser.add_argument('--output',required=True)
args=parser.parse_args()
audio,sr=sf.read(args.audio,dtype='float32')
if audio.ndim>1: audio=audio.mean(axis=1)
duration=len(audio)/sr
if not 3<=duration<=30: raise ValueError('Choose a recording of 3 to 30 seconds.')
model=WhisperModel(args.model,device='cpu',compute_type='int8',cpu_threads=4,local_files_only=True)
segments,_=model.transcribe(resample_poly(audio,16000,sr).astype(np.float32),language='ko',beam_size=5,vad_filter=True)
text=' '.join(s.text.strip() for s in segments)
if not text: raise ValueError('No Korean speech detected.')
with Path(args.output).open('x',encoding='utf-8') as stream:
    json.dump({'text':text,'durationSec':duration},stream,ensure_ascii=False)
