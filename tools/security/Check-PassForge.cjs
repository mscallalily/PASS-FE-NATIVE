#!/usr/bin/env node
'use strict';
// Local synthetic keys only. No real signing key, credentials, server or network.
const path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),req=createRequire(path.join(root,'package.json'));
function malformedSignature(forge,key,digest){
  const a=forge.asn1,make=(type,constructed,value)=>a.create(a.Class.UNIVERSAL,type,constructed,value);
  const info=make(a.Type.SEQUENCE,true,[
    make(a.Type.SEQUENCE,true,[make(a.Type.OID,false,a.oidToDer(forge.pki.oids.sha256).getBytes()),make(a.Type.NULL,false,''),make(a.Type.OCTETSTRING,false,'synthetic-extra-field')]),
    make(a.Type.OCTETSTRING,false,digest),
  ]);
  return key.sign(a.toDer(info).getBytes(),'NONE');
}
function main(){
  const forge=req('node-forge'),version=req('node-forge/package.json').version;
  assert.equal(version,'1.4.2','Install the reviewed node-forge 1.4.2 dependency.');
  const resolved=req.resolve('node-forge');
  for(const consumer of ['@expo/cli','@expo/code-signing-certificates']){
    const consumerRequire=createRequire(path.join(root,'node_modules',consumer,'package.json'));
    assert.equal(consumerRequire.resolve('node-forge'),resolved,consumer+' must use the same updated Forge dependency.');
  }
  const pem=crypto.generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:3,privateKeyEncoding:{type:'pkcs1',format:'pem'},publicKeyEncoding:{type:'pkcs1',format:'pem'}});
  const key=forge.pki.privateKeyFromPem(pem.privateKey),publicKey=forge.pki.publicKeyFromPem(pem.publicKey);
  const md=forge.md.sha256.create();md.update('PASS synthetic integrity test');const digest=md.digest().bytes(),signature=key.sign(md);
  assert.equal(publicKey.verify(digest,signature),true,'Valid SHA-256 signatures must still verify.');
  const altered=forge.md.sha256.create();altered.update('Altered synthetic message');
  assert.equal(publicKey.verify(altered.digest().bytes(),signature),false,'Changed messages must fail verification.');
  let malformedAccepted=false;
  try{malformedAccepted=publicKey.verify(digest,malformedSignature(forge,key,digest));}catch(error){assert.match(error.message,/DigestInfo/);}
  assert.equal(malformedAccepted,false,'Extra nested DigestAlgorithm fields must be rejected.');

  const expo=req('@expo/code-signing-certificates'),pair=expo.generateKeyPair();
  const pairPEM=expo.convertKeyPairToPEM(pair),restored=expo.convertKeyPairPEMToKeyPair(pairPEM);
  const certificate=expo.generateSelfSignedCodeSigningCertificate({keyPair:restored,validityNotBefore:new Date(Date.now()-60000),validityNotAfter:new Date(Date.now()+86400000),commonName:'PASS synthetic code-signing check'});
  const parsed=expo.convertCertificatePEMToCertificate(expo.convertCertificateToCertificatePEM(certificate));
  expo.validateSelfSignedCertificate(parsed,restored);
  const data=Buffer.from('PASS synthetic manifest'),signed=expo.signBufferRSASHA256AndVerify(restored.privateKey,parsed,data);
  assert.equal(crypto.verify('RSA-SHA256',data,pairPEM.publicKeyPEM,Buffer.from(signed,'base64')),true,'Expo certificate signing must interoperate with Node crypto.');
  const csr=expo.convertCSRPEMToCSR(expo.convertCSRToCSRPEM(expo.generateCSR(restored,'PASS synthetic CSR')));
  assert.equal(csr.verify(),true,'Expo certificate requests must still verify.');
  console.log('PASS FORGE CHECK | '+version+' | strict signature validation and Expo signing/CSR checks passed');
  console.log('No actual signing key or network request was used.');
}
if(require.main===module)try{main();}catch(error){console.error('FORGE CHECK FAILED: '+error.message);process.exitCode=1;}
module.exports={malformedSignature};
