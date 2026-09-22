import type { VercelRequest,VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../server/supabaseAdmin.js';

export default async function handler(req:VercelRequest,res:VercelResponse){
  if(req.method==='GET'){
    const mode=req.query['hub.mode']; const token=req.query['hub.verify_token']; const challenge=req.query['hub.challenge'];
    if(mode==='subscribe'&&token===process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(String(challenge||''));
    return res.status(403).send('Forbidden');
  }
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  try{
    const statuses=req.body?.entry?.flatMap((e:any)=>e.changes||[]).flatMap((c:any)=>c.value?.statuses||[])||[];
    const sb=supabaseAdmin();
    for(const s of statuses){
      const status=String(s.status||'').toLowerCase(); const update:any={};
      if(status==='sent'){update.status='Sent';update.sent_at=new Date(Number(s.timestamp)*1000).toISOString()}
      if(status==='delivered'){update.status='Delivered';update.delivered_at=new Date(Number(s.timestamp)*1000).toISOString()}
      if(status==='read'){update.status='Read';update.read_at=new Date(Number(s.timestamp)*1000).toISOString()}
      if(status==='failed'){update.status='Failed';update.error_message=s.errors?.[0]?.title||'WhatsApp delivery failed'}
      if(Object.keys(update).length) await sb.from('campaign_recipients').update(update).eq('provider_message_id',s.id);
    }
    return res.status(200).json({ok:true});
  }catch(e){return res.status(500).json({error:e instanceof Error?e.message:'Webhook processing failed'})}
}
