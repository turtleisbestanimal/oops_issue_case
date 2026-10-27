import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('dist',{recursive:true});
const url=process.env.SUPABASE_URL || '', key=process.env.SUPABASE_PUBLISHABLE_KEY || '';
if(Boolean(url)!==Boolean(key))throw Error('SUPABASE_URL과 SUPABASE_PUBLISHABLE_KEY를 함께 설정하세요.');
if(url && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)))throw Error('Supabase 프로젝트 URL을 확인하세요.');
if(key && !key.startsWith('sb_publishable_')){
 let payload;try{payload=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));}catch{}
 if(payload?.role!=='anon')throw Error('공개 publishable 또는 anon 키만 사용할 수 있습니다. 비밀 키는 설정하지 마세요.');
}
const {cp}=await import('node:fs/promises');
await cp('public','dist',{recursive:true});
await writeFile('dist/cloud-config.js','window.OOPS_CONFIG='+JSON.stringify({url,key}).replace(/</g,'\\u003c')+';\n');
await build({entryPoints:['scripts/cloud.js'],bundle:true,format:'iife',outfile:'dist/cloud.js',target:['es2022'],minify:true});
console.log(url?'공유 데이터베이스 모드로 빌드했습니다.':'DB 미설정: 읽기 전용으로 빌드했습니다.');
