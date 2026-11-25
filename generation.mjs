// Forward streaming progress without exposing reasoning text or credentials.
export async function generate(input, res, endpoint) {
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new Error('Model exceeded the 15 minute generation limit')),900_000);
 const disconnect=()=>{if(!res.writableEnded)controller.abort()};res.on('close',disconnect);
 const send=data=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n')};
 res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-cache'});
 send({phase:'waiting'});
 try {
  const upstream=await fetch(endpoint(input.baseURL,'chat/completions'),{method:'POST',headers:{'Content-Type':'application/json',...(input.apiKey?{Authorization:`Bearer ${input.apiKey}`}:{})},body:JSON.stringify({model:input.model,messages:input.messages,stream:true,temperature:0.3}),signal:controller.signal});
  if(!upstream.ok){
   const data=await upstream.json().catch(()=>({}));
   const detail=typeof data.error==='string'?data.error:data.error?.message;
   throw Error(`HTTP ${upstream.status}${detail?' · '+detail:''}`);
  }
  if(!upstream.headers.get('content-type')?.includes('text/event-stream')){const data=await upstream.json();if(data.error)throw Error(data.error.message||String(data.error));if(data.choices?.[0]?.finish_reason==='length')throw Error('Model output limit reached. Increase the generation token limit in your model server, or request a shorter result. Thinking tokens may count toward this limit.');send({phase:'done',data});return}
  let buffer='',content='',usage,finishReason,ended=false;const decoder=new TextDecoder();
  function event(block){const raw=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!raw)return;if(raw==='[DONE]'){ended=true;return}const data=JSON.parse(raw);if(data.error)throw Error(data.error.message||String(data.error));const choice=data.choices?.[0],delta=choice?.delta;if(data.usage)usage=data.usage;if(choice?.finish_reason){finishReason=choice.finish_reason;ended=true}if(delta?.content){content+=delta.content;send({phase:'generating',characters:content.length,text:delta.content})}else if(delta?.reasoning_content||delta?.reasoning){send({phase:'thinking'})}}
  for await(const chunk of upstream.body){buffer+=decoder.decode(chunk,{stream:true}).replace(/\r/g,'');let index;while((index=buffer.indexOf('\n\n'))>=0){event(buffer.slice(0,index));buffer=buffer.slice(index+2);if(ended)break;}if(ended)break;}
  if(!ended){buffer+=decoder.decode();if(buffer.trim())event(buffer);}if(!ended)throw Error('Model stream disconnected before completion. Please retry.');
  if(finishReason==='length')throw Error('Model output limit reached. Increase the generation token limit in your model server, or request a shorter result. Thinking tokens may count toward this limit.');
  send({phase:'done',data:{choices:[{message:{content},finish_reason:finishReason}],usage}});
 }catch(error){
  const message=controller.signal.aborted?'Generation stopped or exceeded the 15 minute limit.':error.message;
  send({phase:'error',error:(input.apiKey?message.replaceAll(input.apiKey,'[redacted]'):message).slice(0,500)});
 }
 finally{clearTimeout(timer);res.off('close',disconnect);res.end()}
}
