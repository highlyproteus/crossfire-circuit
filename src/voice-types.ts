export type VoiceState={enabled:boolean;muted:string[]};
export type VoiceAction='join'|'activate'|'microphone'|'moderate'|'leave';
export type VoiceRequest={requestId:number;action:VoiceAction;target?:string;enabled?:boolean;muted?:boolean};
export type VoiceCredentials={url:string;token:string;identity:string;room:string};
export type VoiceReply={requestId:number;ok:boolean;error?:string;credentials?:VoiceCredentials};
