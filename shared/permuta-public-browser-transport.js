/* Public Permutas SQL transport. Preserves the existing UI and never falls
 * back to Google while sqlEnabled is true. No passwords, OTPs or raw commands
 * are persisted. A missing receipt is NOT treated as proof of rollback. */
(function(root){
 'use strict';
 var UNIT='01gbm',KEY='bnx:permutas:sql:01gbm:pending:v1',CHALLENGES='bnx:permutas:sql:01gbm:challenges:v1';
 var UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,SHA=/^[a-f0-9]{64}$/;
 var WRITE=['enviarPermuta','solicitarCodigoCancelamentoPermuta','confirmarCancelamentoPermuta'];
 var ACTIONS=['teste','carregarMilitares','getInitialData','buscarMilitarPorRG','consultarPermutasFuturas','consultarHistoricoPermutas','consultarSolicitacao'].concat(WRITE);
 var rows=new Map(),labels=new Map(),activeWrite=null;
 var UNKNOWN='Não foi possível confirmar o resultado. Esta solicitação não será reenviada. Clique novamente para consultar o resultado antes de continuar.';
 var WAIT='A solicitação anterior ainda não teve o resultado confirmado. Nenhum novo envio foi feito. Aguarde e consulte novamente.';
 function fail(message,code){var e=new Error(message);e.code=code||'PERMUTA_SQL_CLIENT_UNAVAILABLE';return e;}
 function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
 function text(v){return String(v==null?'':v).trim();}
 function email(v){return text(v).toLowerCase();}
 function rg(v){return text(v).replace(/\D/g,'');}
 function cfg(){
  var c=root.BRAVONEXO_CONFIG;
  if(!c||c.sqlEnabled!==true||c.codigoUnidade!==UNIT||
   c.apiUrl!=='https://ciqctdckqmopdeoigzfz.supabase.co/functions/v1/permutas-public')
   throw fail('A conexão atualizada de Permutas ainda não está disponível.');
  return c;
 }
 function uuid(){
  var c=root.crypto;
  if(c&&typeof c.randomUUID==='function'){var v=c.randomUUID().toLowerCase();if(UUID.test(v))return v;}
  if(!c||typeof c.getRandomValues!=='function')throw fail('Não foi possível preparar uma solicitação segura neste navegador.');
  var b=new Uint8Array(16);c.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  var h=Array.from(b,function(x){return x.toString(16).padStart(2,'0');}).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
 }
 function storageRead(key){
  try{var v=root.sessionStorage.getItem(key);if(v!==null&&v.length>32768)throw Error();return v===null?null:JSON.parse(v);}
  catch(_){throw fail('Não foi possível conferir a solicitação desta janela. Reabra o aplicativo em uma janela normal do navegador.','PERMUTA_SQL_STORAGE_UNAVAILABLE');}
 }
 function storageWrite(key,value){
  try{if(value===null)root.sessionStorage.removeItem(key);else root.sessionStorage.setItem(key,JSON.stringify(value));}
  catch(_){throw fail('Não foi possível guardar a confirmação desta janela. Nenhum novo envio será feito.','PERMUTA_SQL_STORAGE_UNAVAILABLE');}
 }
 function pending(){
  var p=storageRead(KEY);
  if(p===null)return null;
  if(!plain(p)||p.v!==1||p.unit!==UNIT||!WRITE.includes(p.action)||!UUID.test(p.operationId||'')||!UUID.test(p.requestId||'')||
   typeof p.email!=='string'||p.email!==email(p.email)||!SHA.test(p.fingerprint||'')||!['pending','uncertain'].includes(p.phase)||
   p.action!=='enviarPermuta'&&(!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0)||
   Object.keys(p).some(function(k){return !['v','unit','action','operationId','requestId','email','fingerprint','phase','expectedRevision'].includes(k);}))
   throw fail('A solicitação desta janela precisa ser conferida antes de continuar.','PERMUTA_SQL_STORAGE_INVALID');
  return p;
 }
 function challengeKey(requestId,address){return requestId+'|'+address;}
 function challengeMap(){
  var c=storageRead(CHALLENGES);if(c===null)return {};
  if(!plain(c)||Object.keys(c).length>100)throw fail('Atualize a consulta das permutas antes de continuar.');
  Object.keys(c).forEach(function(k){
   var v=c[k];if(!plain(v)||!UUID.test(v.requestId||'')||!UUID.test(v.challengeId||'')||!Number.isSafeInteger(v.challengeRevision)||v.challengeRevision<0||
    !Number.isSafeInteger(v.expectedRevision)||v.expectedRevision<0||typeof v.email!=='string'||v.email!==email(v.email)||
    k!==challengeKey(v.requestId,v.email)||Object.keys(v).some(function(x){return !['requestId','challengeId','challengeRevision','expectedRevision','email'].includes(x);}))
    throw fail('Atualize a consulta das permutas antes de continuar.');
  });return c;
 }
 function rememberChallenge(result,address,expected){
  var r=result&&result.resposta||result;if(!plain(r)||!UUID.test(r.requestId||'')||!UUID.test(r.challengeId||'')||
   !Number.isSafeInteger(r.challengeRevision)||r.challengeRevision<0)return;
  var all=challengeMap(),k=challengeKey(r.requestId,address),old=all[k],rev=Number.isSafeInteger(expected)?expected:old&&old.expectedRevision;
  if(!Number.isSafeInteger(rev)||rev<0)return;
  all[k]={requestId:r.requestId,challengeId:r.challengeId,challengeRevision:r.challengeRevision,expectedRevision:rev,email:address};
  if(Object.keys(all).length>100)delete all[Object.keys(all)[0]];
  storageWrite(CHALLENGES,all);
 }
 async function fingerprint(action,data){
  // Never hash or persist the six-digit code: another confirmation attempt
  // always gets a new operation, and an uncertain one is receipt-only.
  var safe={};Object.keys(data).sort().forEach(function(k){if(!['codigo','operationId','requestId'].includes(k))safe[k]=data[k];});
  var c=root.crypto;
  if(!c||!c.subtle||typeof c.subtle.digest!=='function')throw fail('Atualize o navegador para enviar esta solicitação com segurança.');
  var bytes=new TextEncoder().encode(JSON.stringify([action,safe])),h=await c.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(h),function(x){return x.toString(16).padStart(2,'0');}).join('');
 }
 function resultError(value){return fail(value&&value.mensagem||value&&value.resposta&&value.resposta.mensagem||'Não foi possível concluir esta solicitação.');}
 function checkResult(value){
  if(!plain(value)||typeof value.sucesso!=='boolean')throw fail('Não foi possível conferir a resposta do sistema.');
  if(value.sucesso===false||value.ok===false||value.resposta&&value.resposta.sucesso===false)throw resultError(value);
  return value;
 }
 async function post(action,data,write){
  var c=cfg(),abort=new AbortController(),timer=setTimeout(function(){abort.abort();},45000),response,value;
  try{
   response=await root.fetch(c.apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao:action,dados:data}),
    credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:abort.signal});
   if(response.redirected)throw Error('redirect');
   value=await response.json();
   if(!plain(value)||typeof value.sucesso!=='boolean')throw Error('invalid response');
   if(write&&(value.incerto===true||response.status>=500)){var unknown=fail(UNKNOWN,'PERMUTA_SQL_RESULT_UNCONFIRMED');unknown.incerto=true;throw unknown;}
   if(!response.ok&&value.sucesso!==false)throw Error('invalid status');
   return value;
  }catch(e){
   if(write&&(e.incerto||!response||!plain(value)||typeof value.sucesso!=='boolean')){
    var uncertain=fail(UNKNOWN,'PERMUTA_SQL_RESULT_UNCONFIRMED');uncertain.incerto=true;throw uncertain;
   }
   throw e&&e.message?e:fail('Falha de comunicação com o sistema.');
  }finally{clearTimeout(timer);}
 }
 function canonical(action,data){
  var d=plain(data)?data:{};
  if(['teste','carregarMilitares','getInitialData'].includes(action))return {};
  if(['buscarMilitarPorRG','consultarPermutasFuturas','consultarHistoricoPermutas'].includes(action))return {rgConsulta:rg(d.rgConsulta||d.rg)};
  if(action==='enviarPermuta')return {email:email(d.email),dataServico:text(d.dataServico),rgEntra:rg(d.rgEntra),rgSai:rg(d.rgSai),observacoes:text(d.observacoes)};
  if(action==='consultarSolicitacao')return {operationId:text(d.operationId),email:email(d.email)};
  var line=text(d.linha||d.row||d.idPermuta||d.id),m=rows.get(line);
  // A legacy line is only a UI lookup hint. SQL receives UUID+revision CAS.
  // Caller-supplied identity never overrides the most recent fetched metadata.
  if(!m||!UUID.test(m.requestId)||!Number.isSafeInteger(m.expectedRevision))
   throw fail('Atualize a consulta das permutas antes de solicitar o cancelamento.','PERMUTA_SQL_REFRESH_REQUIRED');
  var value={requestId:m.requestId,expectedRevision:m.expectedRevision,rgConsulta:rg(d.rgConsulta||d.rg),email:email(d.email||d.emailConfirmacao)};
  if(action==='confirmarCancelamentoPermuta'){
   var ch=challengeMap()[challengeKey(value.requestId,value.email)];
   if(!ch||ch.expectedRevision!==value.expectedRevision)throw fail('Solicite um código para esta permuta antes de confirmar.');
   value.challengeId=ch.challengeId;value.challengeRevision=ch.challengeRevision;value.codigo=text(d.codigo).replace(/\D/g,'');
  }
  return value;
 }
 function sanitizeAdmission(value){
  var r=value.resposta||value,out={};Object.keys(r).forEach(function(k){if(k!=='linhaProcessamento')out[k]=r[k];});
  return value.resposta?Object.assign({},value,{resposta:out}):out;
 }
 async function resolve(p,currentAction,currentData,currentFingerprint){
  var response=await post('consultarSolicitacao',{operationId:p.operationId,email:p.email},false);
  checkResult(response);var r=response.resposta;
  if(!plain(r)||r.operationId!==p.operationId||typeof r.found!=='boolean')throw fail(WAIT,'PERMUTA_SQL_RESULT_UNCONFIRMED');
  if(!r.found)throw fail(WAIT,'PERMUTA_SQL_RESULT_UNCONFIRMED');
  if(r.requestId!==p.requestId)throw fail(WAIT,'PERMUTA_SQL_RESULT_UNCONFIRMED');
  if(p.action==='solicitarCodigoCancelamentoPermuta'&&UUID.test(r.challengeId||'')&&!Number.isSafeInteger(r.challengeRevision))r.challengeRevision=0;
  rememberChallenge(response,p.email,p.expectedRevision);
  storageWrite(KEY,null);
  if(currentAction==='consultarSolicitacao')return response;
  if(p.action!==currentAction||p.fingerprint!==currentFingerprint)
   throw fail('O resultado da solicitação anterior foi conferido. Revise os dados e clique novamente; nenhuma nova solicitação foi enviada.','PERMUTA_SQL_PREVIOUS_RESOLVED');
  if(p.action==='enviarPermuta')return {sucesso:true,resposta:{sucesso:true,requestId:p.requestId,operationId:p.operationId,
   mensagem:'Solicitação de permuta registrada com sucesso. Os e-mails de confirmação serão enviados automaticamente em instantes.',
   militarEntra:labels.get(currentData.rgEntra)||'RG '+currentData.rgEntra,militarSai:labels.get(currentData.rgSai)||'RG '+currentData.rgSai,processamentoImediato:false}};
  if(p.action==='solicitarCodigoCancelamentoPermuta')
   throw fail('O código anterior foi gerado, mas o envio não será repetido. Confira seu e-mail; se necessário, solicite um novo código.','PERMUTA_SQL_CODE_DELIVERY_UNCONFIRMED');
  return checkResult({sucesso:r.outcome==='cancel',resposta:{sucesso:r.outcome==='cancel',...r},mensagem:r.mensagem});
 }
 async function write(action,input){
  var data=canonical(action,input),fp=await fingerprint(action,data),old=pending();
  if(old)return resolve(old,action,data,fp);
  var op=uuid(),requestId=action==='enviarPermuta'?uuid():data.requestId;
  data={...data,operationId:op,requestId:requestId};
  var p={v:1,unit:UNIT,action:action,operationId:op,requestId:requestId,email:data.email,fingerprint:fp,phase:'pending'};
  if(action!=='enviarPermuta')p.expectedRevision=data.expectedRevision;
  storageWrite(KEY,p);
  try{
   var response=await post(action,data,true);
   var receipt=response.resposta||response;
   if(receipt.requestId!==undefined&&receipt.requestId!==requestId||receipt.operationId!==undefined&&receipt.operationId!==op||
    response.sucesso===true&&receipt.requestId!==requestId||
    response.sucesso===true&&action==='solicitarCodigoCancelamentoPermuta'&&(!UUID.test(receipt.challengeId||'')||!Number.isSafeInteger(receipt.challengeRevision)||receipt.challengeRevision<0)){
    var mismatch=fail(UNKNOWN,'PERMUTA_SQL_RESULT_UNCONFIRMED');mismatch.incerto=true;throw mismatch;
   }
   // Persist challenge CAS metadata before raising an ordinary wrong-code or
   // uncertain-delivery error. The next explicit attempt uses its new revision.
   rememberChallenge(response,data.email,data.expectedRevision);
   storageWrite(KEY,null);
   checkResult(response);return action==='enviarPermuta'?sanitizeAdmission(response):response;
  }catch(e){
   if(e.incerto){p.phase='uncertain';storageWrite(KEY,p);}
   else if(e.code!=='PERMUTA_SQL_STORAGE_UNAVAILABLE')storageWrite(KEY,null);
   throw e;
  }
 }
 async function read(action,input){
  var p;
  if(action==='consultarSolicitacao'){
   p=pending();
   if(p)return resolve(p,action,{},'');
  }
  var data=canonical(action,input),value=checkResult(await post(action,data,false));
  if(action==='consultarPermutasFuturas'){
   var entries=value.resposta;if(!Array.isArray(entries))throw fail('Atualize a consulta das permutas antes de continuar.');
   rows.clear();entries.forEach(function(v){if(plain(v)&&UUID.test(v.requestId||'')&&Number.isSafeInteger(v.expectedRevision)&&v.expectedRevision>=0)
    rows.set(String(v.linha),{requestId:v.requestId,expectedRevision:v.expectedRevision});});
  }
  if(action==='carregarMilitares'||action==='getInitialData'){
   var all=value.militares||value.resposta;
   if(Array.isArray(all)){labels.clear();all.forEach(function(v){var id=rg(v.rg);if(id&&!labels.has(id))labels.set(id,text(v.identificacao));});}
  }
  return value;
 }
 function invoke(action,data){
  try{cfg();if(!ACTIONS.includes(action))throw fail('Esta operação não está disponível no sistema atualizado.');}
  catch(e){return Promise.reject(e);}
  if(!WRITE.includes(action))return read(action,data);
  if(activeWrite)return Promise.reject(fail('Aguarde a conclusão da solicitação em andamento. Nenhum novo envio foi feito.','PERMUTA_SQL_IN_FLIGHT'));
  var task=write(action,data);activeWrite=task;
  return task.finally(function(){if(activeWrite===task)activeWrite=null;});
 }
 root.BNXPermutasSql=Object.freeze({invoke:invoke});
})(window);
