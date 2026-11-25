import { marked } from 'marked';
// Walk tokens into plain text; source HTML is never mounted in the page.
export function markdownToText(source) {
 const decode=text=>text.replace(/&(?:amp|lt|gt|quot|apos|#39|nbsp);/g,entity=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'",'&nbsp;':' '})[entity]);
 const html=text=>text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/?(?:p|div|h[1-6]|li|tr|blockquote)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,'');
 function walk(tokens){return tokens.map(token=>{
  const inner=()=>token.tokens?walk(token.tokens):decode(token.text||'');
  switch(token.type){
   case 'space':return '\n\n';
   case 'hr':return '\n\n';
   case 'br':return '\n';
   case 'heading':case 'paragraph':case 'blockquote':return inner()+'\n\n';
   case 'code':return token.text+'\n\n';
   case 'codespan':return token.text;
   case 'html':return decode(html(token.text));
   case 'link':case 'image':{const label=inner(),url=token.href||'';return !label||label===url?url:`${label} (${url})`;}
   case 'list':return '\n'+token.items.map((item,index)=>`${item.task?(item.checked?'☑':'☐'):token.ordered?Number(token.start)+index+'.':'•'} ${walk(item.tokens).trim().replace(/\n/g,'\n  ')}`).join('\n')+'\n\n';
   case 'table':return [token.header,...token.rows].map(row=>row.map(cell=>walk(cell.tokens)).join(' · ')).join('\n')+'\n\n';
   default:return inner();
  }
 }).join('');}
 return walk(marked.lexer(String(source||'').replace(/\r\n?/g,'\n'))).replace(/\n{3,}/g,'\n\n').trim();
}
