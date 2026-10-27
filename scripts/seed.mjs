import {readFile,writeFile} from 'node:fs/promises';
const html=await readFile('public/index.html','utf8');
const state=JSON.parse(html.match(/<script type="application\/json" id="oops-state">([\s\S]*?)<\/script>/)[1]);
state.schema=3;state.purged||={};state.statusTypes||=[...new Set(['보도 확인','기존 확정','검증 보류','문제 제기 보완','제공자료 정리','오인·반박','검토 중','검토 완료','제외 검토',...Object.values(state.cases).map(c=>c.status)])];
const literal=JSON.stringify(state).replaceAll("'","''");
await writeFile('supabase/seed.sql',`-- Initial import only; rerunning never overwrites server edits.\ninsert into public.oops_workspace(id,state) values(1,'${literal}'::jsonb) on conflict(id) do nothing;\n`);
console.log('Seed:',Object.keys(state.cases).length,'cases');
