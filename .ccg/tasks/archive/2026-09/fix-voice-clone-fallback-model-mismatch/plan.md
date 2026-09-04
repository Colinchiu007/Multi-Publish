# Fix: Cloned Voice Fallback Model Key Mismatch  
  
## Root Cause  
  
The voice clone registry key is: tts-voice-clones:v2:minimax-multimodal:speech-2.8-turbo  
But findCloneSamples uses voiceModel parameter which may default to speech-02-hd or empty string  
This causes key mismatch and findCloneSamples returns null, skipping re-clone entirely 
