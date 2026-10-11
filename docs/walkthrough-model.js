/* Local UX simulation only. No backend, authentication, GPS or NFC. */
(function (root) {
  'use strict';
  const standardRules = () => ({id:'standard',name:'Standard field rules',legHelper:'teammate',legTreatment:'Apply a bandage',legInstructions:'Stay out of play until treated. Follow field movement restrictions.',armHelper:'medic',armTreatment:'Medic applies a bandage',armInstructions:'Stay out of play until treated. Follow field weapon restrictions.',returnHelper:'marshal',returnInstructions:'Return to staging for a marshal wristband scan.',expiry:'help'});
  const fresh = () => ({
    day: '', closed: false, code: 'PINE24', field: null,
    fields: [{name: 'Pine Ridge', points: [[10,12],[88,15],[90,88],[12,90]], danger: true, noGo: true}],
    config: null, rulesets:[standardRules()], stage: 'ready', round: 1, remaining: 1200, countdown: 0,
    online: true, location: null, band: false, joined: false, removed: false,
    role: '', team: '', section: 'Unassigned', admitted: false, samplePlayers: 4,
    blueFull: false, hit: 0, wounded: false, assessed: false, life: 1,
    bleed: null, pendingHit: false, dependent: false, capture: false,
    targetLife: 2, pendingScan: null, review: false, scores: {Blue: 120, Red: 95}, tags: {Blue:0,Red:0},
    history: [], log: [], message: ''
  });
  const fail = message => { throw new Error(message); };
  const active = s => { if (s.closed || s.stage !== 'live') fail('Gameplay is frozen. Wait for the host to resume or start the round.'); };
  const connected = s => { if (!s.online) fail('Connection needed. Reconnect and try again.'); };
  const canHelp = (required,helper) => required==='teammate'?['teammate','medic'].includes(helper):required===helper;
  const participant = s => { if (!s.joined || s.removed || !s.admitted || !s.team || !s.role) fail('You are in staging. Complete setup and wait for admission.'); };
  const readyPlayer = s => s.joined && !s.removed && !!s.role && !!s.team;
  const eligible = s => s.samplePlayers + (readyPlayer(s) ? 1 : 0);
  const blockers = s => [!s.day && 'Create a Game Day', !s.field && 'Choose and review a field', !s.config && 'Save game configuration', eligible(s) === 0 && 'At least one player needs a role and team'].filter(Boolean);
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  function validBoundary(p) {
    if (!Array.isArray(p) || p.length < 3 || p.some(a => !Array.isArray(a) || a.length!==2 || a.some(n => !Number.isFinite(n) || n<0 || n>100))) return false;
    let area=0;
    const on = (a,b,c) => Math.abs(cross(a,b,c))<0.00001 && c[0]>=Math.min(a[0],b[0]) && c[0]<=Math.max(a[0],b[0]) && c[1]>=Math.min(a[1],b[1]) && c[1]<=Math.max(a[1],b[1]);
    const intersects = (a,b,c,d) => (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) || on(a,b,c) || on(a,b,d) || on(c,d,a) || on(c,d,b);
    for(let i=0;i<p.length;i++) {
      const a=p[i],b=p[(i+1)%p.length]; if(a[0]===b[0] && a[1]===b[1]) return false;
      area+=a[0]*b[1]-b[0]*a[1];
      for(let j=i+1;j<p.length;j++) if(j!==i+1 && !(i===0 && j===p.length-1) && intersects(a,b,p[j],p[(j+1)%p.length])) return false;
    }
    return Math.abs(area)>100;
  }
  function tick(s, seconds=1) {
    if (!Number.isFinite(seconds) || seconds <= 0 || s.closed) return;
    if(s.stage==='countdown' || s.stage==='resuming') {
      s.countdown=Math.max(0,s.countdown-seconds);
      if(s.countdown===0) {s.stage='live';s.log.push('Round '+s.round+' live');s.message='Round live. Follow your team’s starting instructions.';}
      return;
    }
    if(s.stage!=='live') return;
    s.remaining=Math.max(0,s.remaining-seconds);
    if(s.bleed!==null) {
      s.bleed=Math.max(0,s.bleed-seconds);
      if(s.bleed===0 && s.config.expiry==='death') s.hit=3; // Never reveals the hidden assessment.
    }
    if(s.remaining===0) finish(s);
  }
  function finish(s) {
    s.stage='complete';s.admitted=false;s.review=!!s.pendingScan;
    s.history.push({round:s.round,team:s.team,section:s.section,scores:{...s.scores},tags:{...s.tags}});
    s.log.push('Round '+s.round+' ended');
  }
  function command(s, action, v={}) {
    let msg='';
    switch(action) {
      case 'create': if(s.day) fail('A day is already open. Return to its lobby.'); s.day=String(v.name||'').trim(); if(!s.day) fail('Give this Game Day a name.');msg='Game Day created. Choose a field before play.';break;
      case 'fieldSave':
        if(!String(v.name||'').trim() || !validBoundary(v.points)) fail('Enter a field name and draw a boundary with at least three corners, usable area and no crossing edges.');
        s.fields.push({name:String(v.name).trim(),points:v.points.map(p=>[...p]),danger:false,noGo:false});msg='Field saved. Review it before choosing it for the day.';break;
      case 'fieldSelect': if(s.stage!=='ready') fail('This walkthrough selects fields before play. Paused replacement needs a later review.'); if(!s.fields[v.index]) fail('Choose a saved field.'); s.field=JSON.parse(JSON.stringify(s.fields[v.index]));msg='Day field confirmed. Saved templates stay separate.';break;
      case 'config':
        if(s.stage!=='ready') fail('Configure the next Ready round.');
        if(!Number.isFinite(v.duration)||v.duration<=0||!Number.isFinite(v.countdown)||v.countdown<0||!Number.isFinite(v.bleed)||v.bleed<=0) fail('Use positive duration and bleed-out values, and a countdown of zero or more.');
        {const rules=s.rulesets.find(r=>r.id===(v.rulesetId||'standard'));if(!rules)fail('Choose a saved medic ruleset.');s.config={duration:v.duration*60,countdown:v.countdown,bleed:v.bleed*60,medic:JSON.parse(JSON.stringify(rules)),expiry:v.expiry||rules.expiry};}s.remaining=s.config.duration;msg='Game saved. Review readiness before starting.';break;
      case 'rulesSave': {
        const textKeys=['name','legTreatment','legInstructions','armTreatment','armInstructions','returnInstructions'];
        if(textKeys.some(k=>!String(v[k]||'').trim()))fail('Complete the name, treatments and instructions before saving.');
        if(!['teammate','medic','marshal'].includes(v.legHelper)||!['teammate','medic','marshal'].includes(v.armHelper)||!['medic','marshal'].includes(v.returnHelper)||!['help','death'].includes(v.expiry))fail('Choose valid helper and expiry settings.');
        const index=s.rulesets.findIndex(r=>r.id===v.id);const rule={id:index<0?'rules-'+(s.rulesets.length+1):v.id,legHelper:v.legHelper,armHelper:v.armHelper,returnHelper:v.returnHelper,expiry:v.expiry};
        textKeys.forEach(k=>rule[k]=String(v[k]).trim());if(index<0)s.rulesets.push(rule);else s.rulesets[index]=rule;msg='Ruleset saved. Existing game copies stay unchanged.';break;
      }
      case 'join': if(s.closed) fail('This Game Day has closed. Return home.'); if(s.removed) fail('You were removed. Ask a day admin for readmission.'); if(String(v.code||'').trim().toUpperCase()!==s.code) fail('Code not recognised. Check it or ask your host for the current code.');s.joined=true;msg='Joined the day. Complete your role and team setup.';break;
      case 'assignment':
        if(['live','paused','countdown','resuming'].includes(s.stage) && s.admitted) fail('Assignments are locked during this round. Ask the host for a paused correction.');
        if(!s.joined||s.removed) fail('Join the day first.');
        if(v.team==='Blue' && s.blueFull && s.team!=='Blue') fail('Blue is full. Choose Red or ask the host about capacity.');
        if(v.role!==undefined) s.role=v.role;
        if(v.team!==undefined) {if(s.team!==v.team)s.section='Unassigned';s.team=v.team;}
        if(v.section!==undefined)s.section=v.section;
        msg='Assignment saved.';break;
      case 'location': s.location=v.allowed?'allowed':'denied';msg=v.allowed?'Location enabled in this simulation.':'You can join without location. Location-based objectives are unavailable.';break;
      case 'band': connected(s);if(!s.joined||s.removed)fail('Join the day before linking a wristband.');s.band=true;msg='Wristband linked. Identity and current life are unchanged.';break;
      case 'start':if(s.stage!=='ready') fail('This round has already started.');if(blockers(s).length)fail(blockers(s).join(' · '));s.admitted=readyPlayer(s);s.countdown=s.config.countdown;s.stage=s.countdown?'countdown':'live';msg=s.countdown?'Countdown started for everyone.':'Round live.';break;
      case 'force':if(s.stage!=='countdown')fail('Force Start is available only during the start countdown.');if(blockers(s).length)fail('Resolve start blockers first.');s.countdown=0;s.stage='live';msg='Host started the round early. Gameplay is live.';break;
      case 'cancelCountdown':if(s.stage!=='countdown'&&s.stage!=='resuming')fail('There is no countdown to cancel.');s.stage=s.stage==='resuming'?'paused':'ready';if(s.stage==='ready')s.admitted=false;s.countdown=0;msg='Countdown cancelled.';break;
      case 'pause':active(s);s.stage='paused';msg='Game paused. Hold position; gameplay and injury timers are frozen.';break;
      case 'resume':if(s.stage!=='paused')fail('Pause the round first.');s.stage='resuming';s.countdown=10;msg='Resume in ten seconds. Gameplay remains frozen until zero.';break;
      case 'admit':active(s);if(!readyPlayer(s))fail('The player needs a role and team before admission.');if(s.admitted)fail('Already admitted. Reconnecting does not reset a life.');s.admitted=true;msg='Ghost admitted. Enter safely via your team start, then join play.';break;
      case 'hit':
        active(s);participant(s);if(s.wounded||s.pendingHit)fail('Already out of play. Wait for assessment and treatment.');
        s.assessed=false;
        if(!s.online){s.pendingHit=true;msg='Hit pending. Stay out of play. Assessment is hidden; no treatment can be confirmed offline.';}
        else{s.hit=Math.min(3,s.hit+1);s.wounded=true;s.bleed=s.config.bleed;s.dependent=false;msg='Hit accepted. Stay out of play and ask a permitted teammate to scan your wristband.';}break;
      case 'assess':
        connected(s);active(s);participant(s);if(v.helper==='self')fail('You cannot assess or treat yourself. Ask a permitted teammate to scan.');if(v.helper==='enemy')fail('This helper is not permitted. Ask a teammate with treatment permission.');if(!s.wounded)fail('No treatment needed. This player is in play.');{const required=s.hit===1?s.config.medic.legHelper:s.config.medic.armHelper;if(s.hit<3&&!canHelp(required,v.helper))fail('This injury requires a '+required+'. Ask a permitted helper to scan; the assessment stays hidden.');}s.assessed=true;msg='Assessment revealed. Scanning alone does not return the player to play.';break;
      case 'treat':
        connected(s);active(s);participant(s);if(!s.wounded||!s.assessed)fail('A permitted helper must assess this player first.');if(!canHelp(s.hit===1?s.config.medic.legHelper:s.config.medic.armHelper,v.helper))fail('Treatment permission changed. Ask a permitted helper to scan again.');if(s.hit===3)fail('The player is dead. Follow the configured return process.');s.wounded=false;s.bleed=null;s.dependent=true;msg='Treatment confirmed. Back in play; hit progression is retained.';break;
      case 'respawn': connected(s);active(s);participant(s);if(s.hit!==3||!s.assessed||v.helper!==s.config.medic.returnHelper)fail('An authorised '+s.config.medic.returnHelper+' must confirm the return process.');s.life++;s.hit=0;s.wounded=false;s.assessed=false;s.bleed=null;s.dependent=true;msg='Return confirmed. New life started.';break;
      case 'capture':
        active(s);participant(s);if(s.wounded||s.pendingHit)fail('Only an in-play player can capture tags.');if(s.capture||s.pendingScan)fail('This tag has already been captured or is pending. No extra point awarded.');
        if(!s.online){s.pendingScan={round:s.round,life:s.targetLife};msg='Capture pending. No points awarded until validation.';}
        else{s.capture=true;s.tags[s.team]++;msg='Dog tag captured. +1 tag point; KOTH winner rules remain unchanged.';}break;
      case 'disconnect': s.online=false;msg='Offline. The map shows last-known examples; changing actions need a connection.';break;
      case 'reconnect':
        s.online=true;
        if(s.pendingHit){s.pendingHit=false;if(s.stage==='live'||s.stage==='paused'||s.stage==='resuming'){s.hit=Math.min(3,s.hit+1);s.wounded=true;s.assessed=false;s.bleed=s.config.bleed;msg='Pending hit accepted in the simulation. Assessment remains hidden.';}else msg='Pending hit refused: the round has ended or is not active.';}
        if(s.pendingScan){if(s.stage==='complete'){s.review=true;msg+=' Capture needs admin review before results are final.';}else if(s.stage==='live'){if(s.pendingScan.round!==s.round||s.pendingScan.life!==s.targetLife){s.pendingScan=null;msg+=' Capture refused: target life changed.';}else {s.capture=true;s.tags[s.team]++;s.pendingScan=null;msg+=' Capture accepted once.';}}else msg+=' Capture remains pending while gameplay is frozen.';}
        msg=msg||'Reconnected. Your assignment, injury and life are restored.';break;
      case 'end':if(s.stage==='ready'||s.stage==='complete')fail('There is no running round to end.');finish(s);msg=s.review?'Round ended. Results provisional until pending scan review.':'Round ended. Return to staging.';break;
      case 'reviewScan':
        if(!s.review||!s.pendingScan)fail('There is no pending scan to review.');if(!String(v.reason||'').trim())fail('Record a review reason.');
        if(v.accept && (s.pendingScan.life!==s.targetLife||s.pendingScan.round!==s.round))fail('Cannot approve: target life or round changed. Refuse the submission with a reason.');
        if(v.accept&&!s.capture){s.tags[s.team]++;s.capture=true;}
        s.pendingScan=null;s.review=false;if(s.history.length)s.history.at(-1).tags={...s.tags};msg=v.accept?'Review recorded. Capture accepted once.':'Review recorded. Capture refused; no point awarded.';break;
      case 'next':if(s.stage!=='complete'||s.review)fail('Complete the round and resolve pending review first.');s.round++;s.stage='ready';s.remaining=s.config.duration;s.hit=0;s.wounded=false;s.assessed=false;s.life=1;s.bleed=null;s.admitted=false;s.pendingHit=false;s.dependent=false;s.capture=false;s.scores={Blue:0,Red:0};s.tags={Blue:0,Red:0};msg='Next round ready. Day assignments and selected field retained.';break;
      case 'undo':if(s.stage!=='paused')fail('Pause the game before correcting a hit.');if(!String(v.reason||'').trim())fail('Record a correction reason.');if(s.dependent)fail('Later treatment depends on this hit. A dependent-action review is required; this walkthrough does not execute that correction.');if(!s.wounded)fail('There is no accepted hit to undo.');s.hit=Math.max(0,s.hit-1);s.wounded=false;s.assessed=false;s.bleed=null;msg='Accidental hit corrected. Reason recorded; player notified.';break;
      case 'remove':if(v.target==='Ranger')fail('Ranger is the last day admin. Assign another admin before removing or leaving.');if(!String(v.reason||'').trim())fail('Record a removal reason.');s.removed=true;s.joined=false;s.admitted=false;s.location='denied';msg='Ghost removed. Tracking stopped; admin readmission is required.';break;
      case 'readmit':if(!s.removed)fail('This player has not been removed.');s.removed=false;s.joined=true;s.admitted=false;msg='Readmitted to the day. Existing injury/life retained; round admission remains separate.';break;
      case 'close':if(s.stage!=='complete'||s.review)fail('End the round and resolve pending results review before closing the day.');s.closed=true;s.location='denied';msg='Game Day closed. Tracking stopped; this day cannot reopen.';break;
      default: fail('Unknown simulation action: '+action);
    }
    s.message=msg;s.log.push(msg);return msg;
  }
  function scenario(name) {
    const s=fresh();if(name==='fresh')return s;
    command(s,'create',{name:'Sunday Skirmish'});command(s,'fieldSelect',{index:0});command(s,'config',{duration:20,countdown:10,bleed:10,expiry:'help'});
    if(name!=='late'){command(s,'join',{code:s.code});command(s,'assignment',{role:'Rifleman',team:'Blue',section:'Alpha'});s.location='allowed';s.band=true;}
    if(name!=='ready'){command(s,'start');tick(s,10);}
    if(name==='late') {command(s,'join',{code:s.code});command(s,'assignment',{role:'Rifleman',team:'Red'});s.location='denied';}
    if(name==='review'){command(s,'disconnect');command(s,'capture');s.online=true;command(s,'end');command(s,'reconnect');}
    s.message='';return s;
  }
  const api={fresh,command,tick,blockers,eligible,readyPlayer,validBoundary,scenario};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Walkthrough=api;
})(typeof globalThis!=='undefined'?globalThis:this);
