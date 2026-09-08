import {VoiceChat} from './voice';
import type {Multiplayer} from './network';

export class VoiceUI {
  private dialog:HTMLDialogElement;
  private signature='';
  constructor(readonly chat:VoiceChat,private network:Multiplayer,private modal:(open:boolean)=>void){
    document.getElementById('lobby-content')!.insertAdjacentHTML('afterbegin',`<div class="voice-lobby-bar"><div><b>CREW COMMS</b><small id="voice-lobby-summary">Voice chat · mic off by default</small></div><button id="lobby-voice-open" class="voice-action">VOICE CHAT</button></div>`);
    document.querySelector('.top-right')!.insertAdjacentHTML('afterbegin',`<button id="voice-open" class="icon-button" aria-label="Open lobby voice chat">VOICE</button><button id="voice-quick-mic" class="icon-button" aria-label="Turn microphone on" aria-pressed="false">MIC OFF</button>`);
    document.getElementById('app')!.insertAdjacentHTML('beforeend',`<dialog id="voice-dialog" class="voice-dialog" aria-labelledby="voice-heading"><div class="voice-dialog-head"><div><div class="kicker">YOUR LOBBY · LIVE VOICE</div><h2 id="voice-heading">CREW COMMS.</h2></div><button id="voice-close" class="voice-action" aria-label="Close voice controls">✕</button></div><p class="voice-copy">Everyone in this lobby. Turn your mic on when you’re ready.</p><div id="voice-status" role="status"></div><div class="voice-actions"><button id="voice-join" class="voice-action accent">JOIN VOICE</button><button id="voice-microphone" class="voice-action hidden" aria-pressed="false">TURN MIC ON</button><button id="voice-deafen" class="voice-action hidden" aria-pressed="false">DEAFEN</button><button id="voice-leave" class="voice-action hidden">LEAVE VOICE</button></div><button id="voice-playback" class="voice-action hidden">ENABLE VOICE SOUND</button><label class="voice-volume">Voice volume<input id="voice-volume" type="range" min="0" max="1" step="0.05" aria-label="Voice volume"></label><p id="voice-error" role="status"></p><div class="voice-roster-head"><span>PLAYERS</span><span id="voice-count"></span></div><div id="voice-roster"></div><p class="voice-note">“Mute for me” affects only what you hear. The leader can mute a player for everyone. <span class="voice-desktop-hint">M toggles your mic.</span></p></dialog>`);
    this.dialog=document.getElementById('voice-dialog') as HTMLDialogElement;
    const button=(id:string,action:()=>void)=>document.getElementById(id)!.onclick=action;
    button('lobby-voice-open',()=>this.open());button('voice-open',()=>this.open());button('voice-close',()=>this.dialog.close());
    button('voice-quick-mic',()=>{void chat.toggleMicrophone();});button('voice-microphone',()=>{void chat.toggleMicrophone();});
    button('voice-join',()=>{void chat.join();});button('voice-leave',()=>{void chat.leave();});button('voice-deafen',()=>{void chat.toggleDeafen();});button('voice-playback',()=>{void chat.enablePlayback();});
    const volume=document.getElementById('voice-volume') as HTMLInputElement;volume.value=String(chat.volume);volume.oninput=()=>chat.setVolume(Number(volume.value));
    this.dialog.addEventListener('close',()=>this.modal(false));
    this.dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.code==='KeyM'&&!event.repeat&&(event.target as HTMLElement).tagName!=='INPUT'){event.preventDefault();void chat.toggleMicrophone();}});
    chat.onChange=()=>this.render();this.render();
  }
  open(){if(!this.network.room||this.dialog.open)return;this.modal(true);this.dialog.showModal();this.render();}
  sync(){this.chat.sync();if(!this.network.room&&this.dialog.open)this.dialog.close();this.render();}
  render(){
    const chat=this.chat,game=this.network.room,state=this.network.state,enabled=!!state?.voice?.enabled,connected=chat.connected;
    const el=(id:string)=>document.getElementById(id)!;
    const status=!enabled?'Voice is unavailable. You can keep playing.':chat.busy?'Connecting to crew comms…':chat.reconnecting?'Voice is reconnecting…':connected?chat.leaderMuted?'Listening · muted by the leader':chat.deafened?'Deafened · microphone off':chat.microphone?'Connected · microphone on':'Listening · microphone off':'Join to hear your crew. Your mic stays off.';
    el('voice-status').textContent=status;el('voice-error').textContent=chat.error;el('voice-lobby-summary').textContent=connected?status:enabled?'Voice chat · mic off by default':'Voice is unavailable';
    el('voice-join').classList.toggle('hidden',!!chat.room);(el('voice-join') as HTMLButtonElement).disabled=chat.busy||!enabled||!this.network.connected;
    for(const id of ['voice-microphone','voice-deafen','voice-leave'])el(id).classList.toggle('hidden',!chat.room);
    for(const id of ['voice-microphone','voice-quick-mic']){
      const button=el(id) as HTMLButtonElement;button.textContent=chat.micBusy?'MIC…':chat.microphone?'MUTE MIC':id==='voice-quick-mic'?'MIC OFF':'TURN MIC ON';button.setAttribute('aria-pressed',String(chat.microphone));button.setAttribute('aria-label',chat.microphone?'Mute microphone':'Turn microphone on');button.disabled=!connected||chat.busy||chat.micBusy||chat.leaderMuted||chat.deafened||!this.network.connected;button.classList.toggle('mic-active',chat.microphone);
    }
    el('voice-open').classList.toggle('hidden',!game);el('voice-quick-mic').classList.toggle('hidden',!game);
    el('voice-deafen').textContent=chat.deafened?'HEAR VOICE':'DEAFEN';el('voice-deafen').setAttribute('aria-pressed',String(chat.deafened));el('voice-playback').classList.toggle('hidden',!chat.playbackBlocked);
    const players=state?.players??[],self=game?.sessionId,leader=state?.leader===self;
    el('voice-count').textContent=connected?`${chat.room!.remoteParticipants.size+1} in voice`:`${players.length} in lobby`;
    const info=players.map(player=>{
      const participant=player.id===self?chat.room?.localParticipant:chat.room?.remoteParticipants.get(player.id);
      const mutedByLeader=!!state?.voice?.muted.includes(player.id),mutedForMe=chat.mutedPeers.has(player.id);
      const inVoice=connected&&!!participant,speaking=inVoice&&!!participant?.isSpeaking&&!mutedByLeader&&!mutedForMe;
      return{player,mutedByLeader,mutedForMe,speaking,status:!player.connected?'Reconnecting to game':mutedByLeader?'Muted by leader':mutedForMe?'Muted for you':!inVoice?'Not in voice':speaking?'Speaking':participant?.isMicrophoneEnabled?'Mic on':'Mic off'};
    });
    const signature=JSON.stringify(info.map(({player,mutedByLeader,mutedForMe})=>[player.id,player.name,player.connected,mutedByLeader,mutedForMe]))+self+leader+chat.moderating+connected;
    if(signature===this.signature){
      // Speaking changes must not replace a mute button under a finger or keyboard focus.
      const rows=el('voice-roster').children;
      info.forEach(({status,speaking},index)=>{const row=rows[index];if(row){row.classList.toggle('speaking',speaking);row.querySelector('small')!.textContent=status;}});
      return;
    }
    this.signature=signature;
    const roster=el('voice-roster');roster.replaceChildren();
    for(const {player,status,speaking,mutedByLeader,mutedForMe} of info){
      const row=document.createElement('div');row.className='voice-peer'+(speaking?' speaking':'');row.dataset.voicePlayer=player.id;
      const identity=document.createElement('div');identity.className='voice-peer-name';
      const name=document.createElement('b');name.textContent=player.name+(player.id===self?' · YOU':'')+(player.id===state?.leader?' · LEADER':'');
      const description=document.createElement('small');description.textContent=status;identity.append(name,description);row.append(identity);
      if(player.id!==self){
        const actions=document.createElement('div');actions.className='voice-peer-actions';
        const personal=document.createElement('button');personal.className='voice-action';personal.textContent=mutedForMe?'Hear player':'Mute for me';personal.setAttribute('aria-label',(mutedForMe?'Unmute ':'Mute ')+player.name+' for me');personal.setAttribute('aria-pressed',String(mutedForMe));personal.onclick=()=>chat.mutePeer(player.id);actions.append(personal);
        if(leader){const moderate=document.createElement('button');moderate.className='voice-action moderator';moderate.textContent=chat.moderating===player.id?'Applying…':mutedByLeader?'Allow mic':'Mute for all';moderate.setAttribute('aria-label',(mutedByLeader?'Allow microphone for ':'Mute for everyone: ')+player.name);moderate.disabled=!!chat.moderating||!enabled||!this.network.connected;moderate.onclick=()=>{void chat.moderate(player.id,!mutedByLeader);};actions.append(moderate);}
        row.append(actions);
      }
      roster.append(row);
    }
  }
}
