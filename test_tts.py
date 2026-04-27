import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer

dashscope.api_key = 'sk-8c86fe89446848429434910a2fdb9d1a'
synthesizer = SpeechSynthesizer(model='cosyvoice-v1', voice='longxiaochun')
try:
    audio = synthesizer.call("你好，很高兴认识你")
    print("Result size:", len(audio))
except Exception as e:
    print("Error:", e)
