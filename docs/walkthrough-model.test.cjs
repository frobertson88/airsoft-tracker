const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('./walkthrough-model.js');
const cmd=M.command;

test('start readiness excludes optional section and includes field/config/player blockers',()=>{
  const s=M.fresh();s.samplePlayers=0;
  assert.throws(()=>cmd(s,'start'),/Create a Game Day/);
  cmd(s,'create',{name:'Sunday'});cmd(s,'fieldSelect',{index:0});cmd(s,'config',{duration:20,countdown:0,bleed:10});
  assert.throws(()=>cmd(s,'start'),/At least one player/);
  cmd(s,'join',{code:'pine24'});cmd(s,'assignment',{role:'Medic',team:'Red'});cmd(s,'start');
  assert.equal(s.stage,'live');assert.equal(s.admitted,true);assert.equal(s.section,'Unassigned');
});
test('invalid join, closed day and team capacity have actionable failures',()=>{
  const s=M.scenario('late');s.blueFull=true;
  assert.throws(()=>cmd(s,'join',{code:'wrong'}),/Code not recognised/);
  assert.throws(()=>cmd(s,'assignment',{team:'Blue'}),/Blue is full/);
  cmd(s,'end');cmd(s,'close');assert.throws(()=>cmd(s,'join',{code:s.code}),/closed/);
});
test('boundary checks reject crossing, touching, repeated and collinear corners',()=>{
  assert.equal(M.validBoundary([[10,10],[90,10],[90,90],[10,90]]),true);
  for(const p of [[[10,10],[90,90],[10,90],[90,10]],[[10,10],[30,30],[60,60]],[[10,10],[90,10],[90,10],[10,90]],[[10,10],[90,10],[50,10],[10,90]],[[10,10],[110,10],[10,90]]])assert.equal(M.validBoundary(p),false);
});
test('selecting a field makes an independent day copy',()=>{const s=M.scenario('ready');s.fields[0].points[0][0]=99;assert.equal(s.field.points[0][0],10);});
test('config rejects invalid values without losing previous configuration',()=>{const s=M.scenario('ready');assert.throws(()=>cmd(s,'config',{duration:NaN,countdown:0,bleed:10}),/positive/);assert.equal(s.config.duration,1200);});
test('assignment edits are locked after participation starts',()=>{const s=M.scenario('live');assert.throws(()=>cmd(s,'assignment',{team:'Red'}),/locked/);assert.equal(s.team,'Blue');});
test('countdown cancellation and resume countdown keep lifecycle distinct',()=>{
  const s=M.scenario('ready');cmd(s,'start');cmd(s,'cancelCountdown');assert.equal(s.stage,'ready');assert.equal(s.admitted,false);
  cmd(s,'start');cmd(s,'force');cmd(s,'pause');cmd(s,'resume');cmd(s,'cancelCountdown');assert.equal(s.stage,'paused');
});
test('hit hides assessment; duplicate hit neither advances progression nor restarts timer',()=>{
  const s=M.scenario('live');cmd(s,'hit');M.tick(s,15);assert.equal(s.assessed,false);assert.equal(s.hit,1);
  assert.throws(()=>cmd(s,'hit'),/Already out of play/);assert.equal(s.bleed,585);assert.equal(s.hit,1);
});
test('pause/resume freezes clocks, rejects treatment and preserves remaining bleed-out',()=>{
  const s=M.scenario('live');cmd(s,'hit');cmd(s,'assess',{helper:'medic'});M.tick(s,20);cmd(s,'pause');const time=s.remaining;
  M.tick(s,100);assert.equal(s.bleed,580);assert.equal(s.remaining,time);assert.throws(()=>cmd(s,'treat',{helper:'medic'}),/frozen/);
  cmd(s,'resume');M.tick(s,9);assert.equal(s.stage,'resuming');assert.equal(s.bleed,580);M.tick(s,1);assert.equal(s.stage,'live');M.tick(s,5);assert.equal(s.bleed,575);
});
test('helper permission is checked against hidden injury and treatment remains separate',()=>{
  const s=M.scenario('live');cmd(s,'hit');assert.throws(()=>cmd(s,'assess',{helper:'self'}),/cannot assess/);assert.equal(s.assessed,false);
  cmd(s,'assess',{helper:'teammate'});assert.equal(s.wounded,true);cmd(s,'treat',{helper:'teammate'});assert.equal(s.hit,1);assert.equal(s.bleed,null);
  cmd(s,'hit');assert.equal(s.assessed,false);assert.throws(()=>cmd(s,'assess',{helper:'teammate'}),/requires a medic/);assert.equal(s.assessed,false);
  cmd(s,'assess',{helper:'medic'});cmd(s,'treat',{helper:'medic'});cmd(s,'hit');cmd(s,'assess',{helper:'teammate'});
  assert.throws(()=>cmd(s,'respawn',{helper:'teammate'}),/marshal/);cmd(s,'respawn',{helper:'marshal'});assert.equal(s.life,2);assert.equal(s.hit,0);
});
test('expiry never reveals an unassessed injury',()=>{const s=M.scenario('live');s.config.expiry='death';cmd(s,'hit');M.tick(s,600);assert.equal(s.hit,3);assert.equal(s.assessed,false);assert.equal(s.wounded,true);});
test('new late arrival remains staged until admin admission and is not reset on repeat',()=>{
  const s=M.scenario('late');assert.equal(s.admitted,false);assert.throws(()=>cmd(s,'hit'),/staging/);cmd(s,'admit');cmd(s,'hit');
  assert.throws(()=>cmd(s,'admit'),/Already admitted/);assert.equal(s.hit,1);
});
test('offline hit accepts once on reconnect and preserves identity',()=>{const s=M.scenario('live');cmd(s,'disconnect');cmd(s,'hit');assert.equal(s.hit,0);assert.equal(s.pendingHit,true);assert.throws(()=>cmd(s,'assess',{helper:'medic'}),/Connection needed/);cmd(s,'reconnect');cmd(s,'reconnect');assert.equal(s.hit,1);assert.equal(s.life,1);assert.equal(s.team,'Blue');});
test('ended-round offline hit is refused without wound progression',()=>{const s=M.scenario('live');cmd(s,'disconnect');cmd(s,'hit');cmd(s,'end');cmd(s,'reconnect');assert.equal(s.pendingHit,false);assert.equal(s.hit,0);assert.match(s.message,/refused/);});
test('capture queue awards once; tag points do not change KOTH scores',()=>{
  const s=M.scenario('live');cmd(s,'disconnect');cmd(s,'capture');assert.equal(s.tags.Blue,0);assert.equal(s.capture,false);
  cmd(s,'reconnect');cmd(s,'reconnect');assert.equal(s.tags.Blue,1);assert.equal(s.scores.Blue,120);assert.throws(()=>cmd(s,'capture'),/already/);
});
test('changed target life rejects queued capture',()=>{const s=M.scenario('live');cmd(s,'disconnect');cmd(s,'capture');s.targetLife++;cmd(s,'reconnect');assert.equal(s.tags.Blue,0);assert.equal(s.pendingScan,null);assert.match(s.message,/life changed/);});
test('ended-round review blocks finalisation and validates original target life',()=>{
  const s=M.scenario('review');assert.equal(s.review,true);assert.throws(()=>cmd(s,'next'),/review/);s.targetLife++;
  assert.throws(()=>cmd(s,'reviewScan',{accept:true,reason:'Verified'}),/Cannot approve/);assert.equal(s.tags.Blue,0);
  cmd(s,'reviewScan',{accept:false,reason:'Target life changed'});assert.equal(s.review,false);cmd(s,'next');assert.equal(s.team,'Blue');assert.equal(s.section,'Alpha');assert.equal(s.hit,0);assert.equal(s.round,2);
});
test('approved review updates saved tag history without changing KOTH score',()=>{const s=M.scenario('review');cmd(s,'reviewScan',{accept:true,reason:'Original life verified'});assert.equal(s.history[0].tags.Blue,1);assert.equal(s.history[0].scores.Blue,120);assert.throws(()=>cmd(s,'reviewScan',{accept:true,reason:'Retry'}),/no pending/);});
test('hit correction needs pause/reason and refuses unreviewed dependent treatment',()=>{
  const s=M.scenario('live');cmd(s,'hit');assert.throws(()=>cmd(s,'undo',{reason:'Mistap'}),/Pause/);cmd(s,'pause');assert.throws(()=>cmd(s,'undo'),/reason/);cmd(s,'undo',{reason:'Mistap'});assert.equal(s.hit,0);assert.equal(s.wounded,false);
  cmd(s,'resume');M.tick(s,10);cmd(s,'hit');cmd(s,'assess',{helper:'medic'});cmd(s,'treat',{helper:'medic'});cmd(s,'pause');assert.throws(()=>cmd(s,'undo',{reason:'Mistap'}),/dependent-action/);
});
test('last admin is protected and readmission retains injury/life',()=>{
  const s=M.scenario('live');cmd(s,'hit');assert.throws(()=>cmd(s,'remove',{target:'Ranger',reason:'Test'}),/last day admin/);
  cmd(s,'remove',{target:'Ghost',reason:'Safety'});assert.equal(s.location,'denied');assert.throws(()=>cmd(s,'join',{code:s.code}),/readmission/);
  cmd(s,'readmit');assert.equal(s.hit,1);assert.equal(s.admitted,false);cmd(s,'admit');assert.equal(s.hit,1);
});
test('timed end and next round retain historical assignments and day field',()=>{const s=M.scenario('live');M.tick(s,1200);assert.equal(s.stage,'complete');cmd(s,'next');cmd(s,'assignment',{team:'Red'});assert.equal(s.history[0].team,'Blue');assert.equal(s.field.name,'Pine Ridge');assert.equal(s.section,'Unassigned');});
test('saved ruleset edits leave configured games unchanged until explicitly saved again',()=>{
  const s=M.scenario('ready'),r={...s.rulesets[0],name:'Medic-only field',legHelper:'medic',legTreatment:'Apply two bandages',expiry:'death'};
  cmd(s,'rulesSave',r);assert.equal(s.config.medic.name,'Standard field rules');assert.equal(s.config.medic.legHelper,'teammate');assert.equal(s.config.expiry,'help');
  cmd(s,'config',{duration:20,countdown:0,bleed:10,rulesetId:r.id});assert.equal(s.config.medic.legTreatment,'Apply two bandages');assert.equal(s.config.expiry,'death');
  cmd(s,'rulesSave',{...r,legTreatment:'Library changed'});assert.equal(s.config.medic.legTreatment,'Apply two bandages');
});
test('selected custom helper permissions apply to assessment, treatment and return',()=>{
  const s=M.scenario('ready');cmd(s,'rulesSave',{...s.rulesets[0],id:null,name:'Custom',legHelper:'medic',armHelper:'teammate',returnHelper:'medic'});
  cmd(s,'config',{duration:20,countdown:0,bleed:10,rulesetId:s.rulesets.at(-1).id});cmd(s,'start');cmd(s,'hit');
  assert.throws(()=>cmd(s,'assess',{helper:'teammate'}),/requires a medic/);assert.equal(s.assessed,false);cmd(s,'assess',{helper:'medic'});cmd(s,'treat',{helper:'medic'});
  cmd(s,'hit');cmd(s,'assess',{helper:'teammate'});cmd(s,'treat',{helper:'teammate'});cmd(s,'hit');cmd(s,'assess',{helper:'teammate'});
  assert.throws(()=>cmd(s,'respawn',{helper:'marshal'}),/authorised medic/);cmd(s,'respawn',{helper:'medic'});assert.equal(s.life,2);
});
test('invalid medic rules never replace saved rules or current game copy',()=>{
  const s=M.scenario('ready');assert.throws(()=>cmd(s,'rulesSave',{...s.rulesets[0],name:' '}),/Complete/);assert.throws(()=>cmd(s,'rulesSave',{...s.rulesets[0],legHelper:'self'}),/valid helper/);assert.equal(s.rulesets[0].legHelper,'teammate');assert.equal(s.config.medic.legHelper,'teammate');
});
