import type {Room,RemoteAudioTrack,RemoteParticipant,RemoteTrack,RemoteTrackPublication} from 'livekit-client';
import type {Multiplayer} from './network';

function voiceError(error:unknown,fallback:string){
  const message=error instanceof Error?error.message:'';
  // SDK errors can include signaling details. Only our own actionable messages
  // are carried into the player-facing UI.
  return /^(Reconnect to the game|Voice controls are busy|Please wait a moment|The lobby leader has muted|Voice chat is temporarily|Voice chat could not complete|Voice chat did not respond|The game connection changed|The lobby changed|Microphone access did not update|Only the lobby leader)/.test(message)?message:fallback;
}

export class VoiceChat {
  room?:Room;
  busy=false;micBusy=false;moderating='';error='';
  deafened=false;volume=.8;
  readonly mutedPeers=new Set<string>();
  onChange=()=>{};
  private generation=0;
  private gameKey='';
  private gameConnected=false;
  private audio=new Map<string,{track:RemoteAudioTrack;element:HTMLAudioElement}>();
  private audioRoot=document.createElement('div');
  constructor(readonly network:Multiplayer){
    this.audioRoot.hidden=true;this.audioRoot.id='voice-audio';document.body.append(this.audioRoot);
    try{const saved=localStorage.getItem('crossfire-voice-volume');if(saved!==null)this.volume=Math.max(0,Math.min(1,Number(saved)||0));}catch{}
    addEventListener('pagehide',()=>{void this.leave(false);});
  }
  get connected(){return this.room?.state==='connected';}
  get reconnecting(){return this.room?.state==='reconnecting'||this.room?.state==='signalReconnecting';}
  get microphone(){return this.connected&&this.room!.localParticipant.isMicrophoneEnabled;}
  get leaderMuted(){const id=this.network.room?.sessionId;return !!id&&!!this.network.state?.voice?.muted.includes(id);}
  get playbackBlocked(){return this.connected&&!this.room!.canPlaybackAudio&&!this.deafened;}
  private changed(){this.onChange();}
  sync(){
    const game=this.network.room,key=game?game.roomId+':'+game.sessionId:'';
    if(key!==this.gameKey){this.gameKey=key;this.mutedPeers.clear();void this.leave(false);}
    if(!this.network.connected&&this.gameConnected&&this.room){void this.stopMicrophone();}
    if(game&&!this.network.connected&&!this.network.reconnecting&&(this.room||this.busy))void this.leave(false);
    this.gameConnected=this.network.connected;
    if(this.leaderMuted&&this.microphone&&!this.micBusy)void this.stopMicrophone();
  }
  async join(){
    if(this.busy||this.room)return;
    this.error='';this.busy=true;const generation=++this.generation;this.changed();
    let room:Room|undefined;
    try{
      const [sdk,reply]=await Promise.all([import('livekit-client'),this.network.requestVoice('join')]);
      if(generation!==this.generation)return;
      const credentials=reply.credentials;
      if(!credentials||credentials.identity!==this.network.room?.sessionId)throw new Error('The lobby changed. Join voice again.');
      room=new sdk.Room({audioCaptureDefaults:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1},publishDefaults:{audioPreset:sdk.AudioPresets.speech,dtx:true,red:true,stopMicTrackOnMute:true},disconnectOnPageLeave:true});
      this.room=room;
      const current=room;
      room.on(sdk.RoomEvent.TrackSubscribed,(track,publication,participant)=>{if(this.room===current)this.attach(track,publication,participant);});
      room.on(sdk.RoomEvent.TrackUnsubscribed,track=>{if(this.room===current)this.detach(track.sid);});
      room.on(sdk.RoomEvent.TrackPublished,()=>{if(this.room===current){this.applyPlayback();this.changed();}});
      for(const event of [sdk.RoomEvent.ActiveSpeakersChanged,sdk.RoomEvent.ParticipantConnected,sdk.RoomEvent.ParticipantDisconnected,sdk.RoomEvent.TrackMuted,sdk.RoomEvent.TrackUnmuted,sdk.RoomEvent.LocalTrackPublished,sdk.RoomEvent.LocalTrackUnpublished,sdk.RoomEvent.AudioPlaybackStatusChanged,sdk.RoomEvent.ConnectionStateChanged] as const)room.on(event,()=>this.changed());
      room.on(sdk.RoomEvent.ParticipantPermissionsChanged,()=>{
        if(this.room===current&&!current.localParticipant.permissions?.canPublish)void this.stopMicrophone();
        this.changed();
      });
      room.on(sdk.RoomEvent.Reconnected,()=>{
        if(this.room!==current)return;
        void this.stopMicrophone();
        void this.network.requestVoice('activate').then(()=>{if(this.room===current){this.applyPlayback();this.changed();}}).catch(()=>{if(this.room===current){this.error='Voice reconnected with limited access. Leave voice and join again.';this.changed();}});
      });
      room.on(sdk.RoomEvent.Disconnected,()=>{
        if(this.room!==current)return;
        this.room=undefined;this.clearAudio();this.error='Voice disconnected. You can join again.';this.changed();
      });
      await room.connect(credentials.url,credentials.token,{autoSubscribe:true});
      if(generation!==this.generation){await room.disconnect(true);return;}
      await this.network.requestVoice('activate');
      if(generation!==this.generation){await room.disconnect(true);return;}
      this.applyPlayback();
      await room.startAudio().catch(()=>{});
    }catch(error){
      if(generation===this.generation){this.room=undefined;this.clearAudio();this.error=voiceError(error,'Voice chat could not connect. Check your network and try again.');}
      await room?.disconnect(true).catch(()=>{});
    }finally{if(generation===this.generation){this.busy=false;this.changed();}}
  }
  private attach(track:RemoteTrack,publication:RemoteTrackPublication,participant:RemoteParticipant){
    if(track.kind!=='audio')return;
    const audio=track as RemoteAudioTrack;
    if(this.deafened||this.mutedPeers.has(participant.identity)){audio.setVolume(0);publication.setSubscribed(false);return;}
    const element=document.createElement('audio');element.autoplay=true;element.setAttribute('playsinline','');element.dataset.voicePeer=participant.identity;element.volume=this.volume;
    audio.setVolume(this.volume);audio.attach(element);this.audioRoot.append(element);
    if(track.sid)this.audio.set(track.sid,{track:audio,element});
    this.changed();
  }
  private detach(sid:string|undefined){if(!sid)return;const attached=this.audio.get(sid);if(attached){attached.track.detach(attached.element);attached.element.remove();this.audio.delete(sid);}}
  private clearAudio(){for(const sid of [...this.audio.keys()])this.detach(sid);this.audioRoot.replaceChildren();}
  private applyPlayback(){
    for(const participant of this.room?.remoteParticipants.values()??[]){
      const allowed=!this.deafened&&!this.mutedPeers.has(participant.identity);
      for(const publication of participant.audioTrackPublications.values()){
        (publication.track as RemoteAudioTrack|undefined)?.setVolume(allowed?this.volume:0);
        publication.setSubscribed(allowed);
      }
    }
    for(const {element} of this.audio.values()){element.volume=this.volume;element.muted=this.deafened||this.mutedPeers.has(element.dataset.voicePeer??'');}
  }
  mutePeer(identity:string){if(this.mutedPeers.has(identity))this.mutedPeers.delete(identity);else this.mutedPeers.add(identity);this.applyPlayback();this.changed();}
  setVolume(volume:number){this.volume=Math.max(0,Math.min(1,volume));try{localStorage.setItem('crossfire-voice-volume',String(this.volume));}catch{}this.applyPlayback();this.changed();}
  async toggleDeafen(){this.deafened=!this.deafened;if(this.deafened)await this.stopMicrophone();this.applyPlayback();if(!this.deafened)await this.enablePlayback();this.changed();}
  async enablePlayback(){await this.room?.startAudio().catch(()=>{this.error='Tap Enable voice sound again to allow audio playback.';});this.changed();}
  private async stopMicrophone(){
    const room=this.room;if(!room)return;
    await room.localParticipant.setMicrophoneEnabled(false).catch(()=>{});
    this.changed();
  }
  async toggleMicrophone(){
    const room=this.room;if(!this.connected||!room||this.micBusy)return;
    const enabled=!this.microphone;
    if(enabled&&this.leaderMuted){this.error='The lobby leader has muted your microphone.';this.changed();return;}
    if(enabled&&this.deafened){this.error='Turn voice sound back on before enabling your microphone.';this.changed();return;}
    const generation=this.generation;this.micBusy=true;this.error='';this.changed();
    try{
      if(!enabled)await this.stopMicrophone();
      await this.network.requestVoice('microphone',{enabled});
      if(this.room!==room)return;
      if(enabled){
        const deadline=Date.now()+4000;
        while(!room.localParticipant.permissions?.canPublish&&this.room===room&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,40));
        if(this.room!==room)return;
        if(!room.localParticipant.permissions?.canPublish)throw new Error('Microphone access did not update. Please try again.');
        await room.localParticipant.setMicrophoneEnabled(true);
        if(this.room!==room)await room.disconnect(true);
      }
    }catch(error){
      await room.localParticipant.setMicrophoneEnabled(false).catch(()=>{});
      if(this.room===room){
        const name=error instanceof Error?error.name:'';
        this.error=name==='NotAllowedError'?'Microphone permission was denied. Allow it in your browser settings, then try again.':name==='NotFoundError'?'No microphone was found. Connect one and try again.':voiceError(error,'The microphone could not start. You can still listen.');
      }
    }finally{if(generation===this.generation){this.micBusy=false;this.changed();}}
  }
  async moderate(identity:string,muted:boolean){
    if(this.moderating)return;this.moderating=identity;this.error='';this.changed();
    try{await this.network.requestVoice('moderate',{target:identity,muted});}
    catch(error){this.error=error instanceof Error?error.message:'Could not apply the leader mute.';}
    finally{this.moderating='';this.changed();}
  }
  async leave(notify=true){
    ++this.generation;const room=this.room;this.room=undefined;this.busy=false;this.micBusy=false;this.error='';this.clearAudio();
    await room?.disconnect(true).catch(()=>{});
    if(notify&&this.network.connected)void this.network.requestVoice('leave').catch(()=>{});
    this.changed();
  }
}
