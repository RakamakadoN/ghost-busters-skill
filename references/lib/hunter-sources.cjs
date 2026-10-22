'use strict';

/**
 * Safe, explicit evidence adapters. No SQL, no subprocess execution, no
 * arbitrary URL redirects. The HTTPS endpoint must return a pre-aggregated
 * v1.4 guard JSON object, under authorization controlled by its owner.
 */
const fs=require('node:fs');
const path=require('node:path');
const net=require('node:net');

const LIMIT=256*1024;
function parseSmallJson(bytes) {
  if(bytes.length>LIMIT) throw new Error('Evidence exceeds 256 KiB');
  const obj=JSON.parse(bytes.toString('utf8'));
  if(!obj || typeof obj!=='object' || Array.isArray(obj)) throw new Error('Evidence must be an object');
  return obj;
}
function readFileEvidence(configFile,relativePath) {
  if(path.isAbsolute(relativePath)) throw new Error('Absolute evidence paths are not allowed');
  const root=fs.realpathSync(path.dirname(path.resolve(configFile)));
  const abs=path.resolve(root,relativePath);
  if(!abs.startsWith(root+path.sep)) throw new Error('Evidence must remain inside the config directory');
  const real=fs.realpathSync(abs);
  if(!real.startsWith(root+path.sep)) throw new Error('Evidence symlink escapes config directory');
  const stat=fs.statSync(real);
  if(!stat.isFile() || stat.size>LIMIT) throw new Error('Evidence must be a <=256 KiB file');
  return parseSmallJson(fs.readFileSync(real));
}
function validateHttpsAddress(raw,hosts) {
  const u=new URL(raw);
  if(u.protocol!=='https:' || u.username || u.password || u.search || u.hash ||
     (u.port && u.port!=='443') ||
     net.isIP(u.hostname) || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(u.hostname) ||
     u.hostname.endsWith('.local') || u.hostname.endsWith('.internal') ||
     u.hostname.endsWith('.localhost') ||
     !hosts.includes(u.hostname)) {
    throw new Error('URL must be HTTPS on an exact approved DNS hostname without credentials, query or redirect');
  }
  return u;
}
async function readHttpsEvidence(source,allowedHosts,env,fetchImpl=globalThis.fetch) {
  const address=validateHttpsAddress(source.url,allowedHosts);
  const headers={'accept':'application/json'};
  if(source.tokenEnv) {
    const token=env[source.tokenEnv];
    if(typeof token!=='string' || !token.trim()) throw new Error('Configured credential is missing');
    headers.authorization='Bearer '+token;
  }
  const response=await fetchImpl(address.href,{
    method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(12000),
    cache:'no-store'
  });
  if(!response.ok || !/^application\/json\b/i.test(response.headers.get('content-type')||'')) {
    throw new Error('Evidence endpoint returned non-200 or non-JSON response');
  }
  const length=Number(response.headers.get('content-length')||0);
  if(Number.isFinite(length)&&length>LIMIT) throw new Error('Oversized evidence response');
  if(!response.body) throw new Error('No evidence body');
  const reader=response.body.getReader(),buffers=[];let total=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();
      if(done) break;
      total+=value.byteLength;
      if(total>LIMIT) throw new Error('Oversized evidence response');
      buffers.push(Buffer.from(value));
    }
  } finally {reader.releaseLock();}
  return parseSmallJson(Buffer.concat(buffers,total));
}
async function collect(config,configPath,env=process.env,fetchImpl=globalThis.fetch) {
  const observations={};
  // Each check fails independently, but missing or invalid data becomes
  // EVIDENCE_ERROR in the engine: never treat retrieval failure as healthy.
  for(const check of config.checks) {
    try {
      observations[check.id]=check.source.kind==='file' ?
        readFileEvidence(configPath,check.source.path) :
        await readHttpsEvidence(check.source,config.allowedHosts,env,fetchImpl);
    } catch (_) {
      observations[check.id]=null;
    }
  }
  return observations;
}
module.exports={collect,readFileEvidence,readHttpsEvidence,validateHttpsAddress,parseSmallJson,LIMIT};
