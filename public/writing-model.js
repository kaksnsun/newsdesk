import {words,languageNames,resolveInterfaceLanguage} from './locales/index.js';

export function defaultWritingTitle(projectName,task,language){
 const key={summary:'materialSummary',outline:'outlineLabel'}[task];
 if(!key)return projectName;
 const suffix=words[resolveInterfaceLanguage(language)][key];
 return projectName+(language==='zh'?'｜':' — ')+suffix;
}
export const articleFields=['markdownMode','outputLanguage','style','styleRules','reference','negativePrompt','brief','title','article'];
export function makeWriting(project, values={}, id=crypto.randomUUID()) {
 return {id,name:'',markdownMode:'off',outputLanguage:'en',style:'',styleRules:'',reference:'',negativePrompt:'',brief:'',title:'',article:'',started:'explore',action:'draft',selectedSourceIds:(project.sources||[]).map(s=>s.id),autoSelectSources:true,annotations:[],undo:[],redo:[],...values};
}
export function migrateProject(project,language='en') {
 project.sources ||= [];project.importedArticles ||= [];
 const imports=project.sources.filter(s=>s.kind==='article');
 for(const source of imports)if(!project.importedArticles.some(a=>a.id===source.id))project.importedArticles.push({...source});
 project.sources=project.sources.filter(s=>s.kind!=='article');
 let next=Math.max(0,...project.sources.map(s=>Number(s.number)||0));
 for(const source of project.sources){source.number ||= ++next;source.sourceKind ||= source.url||source.fileType==='website'?'link':source.fileType&&source.fileType!=='text'?'file':'paste';}
 project.nextSourceNumber=Math.max(project.nextSourceNumber||1,next+1);
 if(!Array.isArray(project.writings)||!project.writings.length){
  const legacy=Object.fromEntries(articleFields.filter(k=>project[k]!==undefined).map(k=>[k,project[k]]));
  project.writings=[makeWriting(project,{...legacy,outputLanguage:Object.hasOwn(languageNames,legacy.outputLanguage)?legacy.outputLanguage:language,markdownMode:legacy.markdownMode==='on'?'on':'off'})];
 }
 const localSourceIds=new Set([...project.sources,...(project.deletedSources||[])].map(source=>source.id));
 for(const writing of project.writings){
  if(!Object.hasOwn(languageNames,writing.outputLanguage))writing.outputLanguage=resolveInterfaceLanguage(language);
  if(writing.started==='generated'&&writing.article?.trim()&&!writing.title?.trim()){
   writing.title=defaultWritingTitle(project.name,writing.action,writing.outputLanguage);
  }
  writing.annotations ||= [];writing.undo ||= [];writing.redo ||= [];
  writing.selectedSourceIds=Array.isArray(writing.selectedSourceIds)?writing.selectedSourceIds.filter(id=>localSourceIds.has(id)):project.sources.map(source=>source.id);
  if(writing.action===undefined)writing.action='draft';}
 if(!project.writings.some(w=>!w.deletedAt))project.writings.push(makeWriting(project,{outputLanguage:language}));
 if(!project.writings.some(w=>w.id===project.activeWritingId&&!w.deletedAt))project.activeWritingId=project.writings.find(w=>!w.deletedAt).id;
 return project;
}
export function selectedSources(project,writing){
 const ids=new Set(writing.selectedSourceIds||[]);
 return (project.sources||[]).filter(source=>ids.has(source.id));
}
export function sourcesForPrompt(project,writing){
 return selectedSources(project,writing).map(source=>
  `[Source #${source.number}: ${source.name}]\n${source.url?source.url+'\n':''}${source.text}`
 ).join('\n\n');
}
export function locateAnnotation(text,annotation){
 if(text===annotation.snapshot&&text.slice(annotation.start,annotation.end)===annotation.quote)return {start:annotation.start,end:annotation.end};
 const matches=[];let index=text.indexOf(annotation.quote);if(!annotation.quote)return null;
 while(index>=0){matches.push(index);index=text.indexOf(annotation.quote,index+1);}
 if(matches.length===1)return {start:matches[0],end:matches[0]+annotation.quote.length};
 const anchored=matches.filter(start=>(!annotation.prefix||text.slice(Math.max(0,start-annotation.prefix.length),start)===annotation.prefix)&&(!annotation.suffix||text.slice(start+annotation.quote.length,start+annotation.quote.length+annotation.suffix.length)===annotation.suffix));
 return anchored.length===1?{start:anchored[0],end:anchored[0]+annotation.quote.length}:null;
}

export function splitGeneratedArticle(output){
 const raw=String(output).trim();
 try{const data=JSON.parse(raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,''));if(data&&typeof data.title==='string'&&typeof data.body==='string'&&data.body.trim())return {title:data.title.trim(),body:data.body.trim()};}catch{}
 const match=raw.match(/^(?:#\s+([^\n]+)|(?:标题|Title)\s*[:：]\s*([^\n]+))\n+([\s\S]+)$/i);
 if(match)return {title:(match[1]||match[2]).trim().replace(/\s+#+$/,''),body:match[3].trim()};
 return {title:'',body:output};
}

// Independent, exact edits. Common line anchors keep unrelated paragraphs separate.
export function articleChanges(before,after){
 if(before===after)return [];
 const a=before.match(/[^\n]*\n|[^\n]+$/g)||[],b=after.match(/[^\n]*\n|[^\n]+$/g)||[];
 const changes=[];
 function add(start,oldText,newText){let left=0,right=0;while(left<oldText.length&&left<newText.length&&oldText[left]===newText[left])left++;if(left&&/[\uD800-\uDBFF]/.test(oldText[left-1]))left--;while(right<oldText.length-left&&right<newText.length-left&&oldText.at(-1-right)===newText.at(-1-right))right++;if(right&&/[\uDC00-\uDFFF]/.test(oldText[oldText.length-right]))right--;const from=start+left,to=start+oldText.length-right;if(from===to&&newText.slice(left,newText.length-right)==='')return;changes.push({start:from,end:to,before:before.slice(from,to),after:newText.slice(left,newText.length-right),baseline:before,left:before.slice(Math.max(0,from-40),from),right:before.slice(to,to+40),status:'pending'});}
 if(a.length*b.length>250000){add(0,before,after);return changes;}
 const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
 let i=0,j=0,offset=0,start=0,old='',next='';const flush=()=>{if(old||next){add(start,old,next);old='';next='';}};
 while(i<a.length||j<b.length){if(i<a.length&&j<b.length&&a[i]===b[j]){flush();offset+=a[i].length;i++;j++;start=offset;}else if(j<b.length&&(i===a.length||dp[i][j+1]>=dp[i+1][j])){if(!old&&!next)start=offset;next+=b[j++];}else{if(!old&&!next)start=offset;old+=a[i];offset+=a[i++].length;}}flush();return changes;
}
export function locateArticleChange(text,change){if(text===change.baseline&&text.slice(change.start,change.end)===change.before)return {start:change.start,end:change.end};if(change.before){const start=text.indexOf(change.before);if(start<0||text.indexOf(change.before,start+1)!==-1)return null;return {start,end:start+change.before.length};}const context=change.left+change.right;if(!context)return text===''?{start:0,end:0}:null;const start=text.indexOf(context);if(start<0||text.indexOf(context,start+1)!==-1)return null;return {start:start+change.left.length,end:start+change.left.length};}
export function verifiedSourceCorrections(text,candidates,sources){const accepted=[];if(!Array.isArray(candidates))return accepted;for(const candidate of candidates.slice(0,30)){if(!candidate||typeof candidate.quote!=='string'||!candidate.quote||typeof candidate.replacement!=='string'||!candidate.replacement.trim()||typeof candidate.sourceQuote!=='string'||!candidate.sourceQuote.trim()||candidate.quote===candidate.replacement)continue;const source=sources.find(s=>candidate.sourceNumber!==undefined&&String(s.number)===String(candidate.sourceNumber)||typeof candidate.sourceId==='string'&&s.id===candidate.sourceId);if(!source||!source.text.includes(candidate.sourceQuote)||!candidate.sourceQuote.includes(candidate.replacement.trim()))continue;const start=text.indexOf(candidate.quote);if(start<0||text.indexOf(candidate.quote,start+1)!==-1)continue;const end=start+candidate.quote.length;if(accepted.some(item=>start<item.end&&end>item.start))continue;accepted.push({start,end,quote:candidate.quote,replacement:candidate.replacement,sourceNumber:source.number,sourceId:source.id,sourceName:source.name,sourceQuote:candidate.sourceQuote});}return accepted.sort((a,b)=>a.start-b.start);}

// Keep the original three preset IDs so saved drafts and personal overrides carry forward.
const purposePresets = {
  objective: {
    name: { en: "Straight News", zh: "消息报道" },
    summary: { en: "Lead with the verified news, then add context and attributed responses.", zh: "最重要的已核实事实放在导语，随后交代背景和各方回应。" },
    rules: "Style: Straight news. Lead with the most important, verifiable facts, then provide relevant context, responses from key parties, and developments. Use an inverted-pyramid structure and prioritize the basic questions: what happened, when and where, who was involved, and why it matters. Keep the tone neutral and restrained; do not add the writer’s opinion or present unverified claims as facts. Use direct quotations only when they come from supplied or clearly verifiable material. If a claim cannot be reliably sourced, paraphrase it with attribution or state that it remains unconfirmed. Write a specific, accurate headline without exaggeration or manufactured suspense."
  },
  briefing: {
    name: { en: "Briefing", zh: "简报" },
    summary: { en: "Give readers the takeaway, key facts and what to watch next.", zh: "先用一句话概括要点，再列出事实、影响和后续看点。" },
    rules: "Style: Briefing. Write for readers who need to understand a situation quickly. Begin with a one-sentence summary of the main takeaway, then list the key facts, context, implications, and issues to watch in order of importance. Give each bullet one main point. Use short sentences and clear subheadings; remove repeated context and decorative language. Separate confirmed facts from information that is still uncertain. Do not omit essential qualifications simply to make the briefing shorter."
  },
  explanatory: {
    name: { en: "Explainer", zh: "解释性报道" },
    summary: { en: "Answer a reader’s question with plain-language definitions and examples.", zh: "从读者的疑问出发，用通俗的定义和例子讲清来龙去脉。" },
    rules: "Style: Explainer. Explain a complex issue, event, policy, or concept to readers with general knowledge who may be unfamiliar with the subject. Start with the question readers most need answered, then explain the concepts, background, mechanisms, stakeholders, implications, and any unresolved disputes. Define specialized terms in plain language when they first appear. Use concrete examples to aid understanding, but do not present an example as a universal rule. Build the explanation step by step, avoid jargon, and distinguish facts from interpretation."
  },
  analysis: {
    name: { en: "Analysis", zh: "分析" },
    summary: { en: "Weigh a central assessment against evidence, alternatives and uncertainty.", zh: "用证据检验核心判断，讨论其他解释，以及什么会改变结论。" },
    rules: "Style: Analysis. Organize the piece around a clear question or judgment. Explain the context, contributing factors, evidence, possible mechanisms, and likely implications. State a qualified central assessment near the beginning, support it with evidence, and consider alternative explanations, counterevidence, and uncertainty. Do not confuse correlation with causation or present forecasts as established facts. Conclude by identifying the conditions behind the assessment, indicators to watch, or new information that could change it.\n\nFinancial analysis subtype: When covering a market, company, industry, or the broader economy, specify the subject, time period, and measurement basis. Explain the source, comparison baseline, and limitations of key data; distinguish nominal from inflation-adjusted values and short-term movements from long-term trends. Discuss risks, scenarios, and assumptions. Do not imply that past performance guarantees future results, and do not make unsupported investment recommendations or promises of returns."
  },
  investigative: {
    name: { en: "Investigative Reporting", zh: "调查报道" },
    summary: { en: "Trace findings to documents and witnesses, and include responses to allegations.", zh: "沿文件和证词呈现证据链，交代被质疑方的回应与待核实的问题。" },
    rules: "Style: Investigative reporting. Make traceable evidence and corroboration the foundation of the piece. Explain the findings, evidence trail, key timeline, relevant parties, and their responses. For each major allegation or conclusion, state its basis and how reliable it is. Clearly distinguish documentary facts, witness statements, inference, and information that could not be independently verified. Give parties facing criticism a fair opportunity to respond; never use insinuation as a substitute for evidence. Protect sensitive source information and do not disclose personal information that the supplied material does not authorize for publication. Identify questions the investigation has not resolved."
  },
  profile: {
    name: { en: "Profile", zh: "人物报道" },
    summary: { en: "Reveal a person through documented scenes, choices and competing perspectives.", zh: "从有依据的场景与选择写出人物，也呈现其矛盾和他人的看法。" },
    rules: "Style: Profile. Present a person’s character, circumstances, and influence through their experiences, choices, actions, and specific scenes. Open with a fact-based detail, then place the individual story in its relevant social, industry, or historical context. Avoid reducing the person to a single label or portraying them as a hero or villain; include contradictions, limitations, and other perspectives. Describe thoughts, motives, or private life only when supported by reliable material; do not speculate."
  },
  opinion: {
    name: { en: "Opinion", zh: "评论" },
    summary: { en: "Make a case, state its limits and address the strongest counterargument.", zh: "提出明确主张，交代适用边界，回应最有力的反方论据。" },
    rules: "Style: Opinion. State a clear central argument and support it with facts, logic, and specific examples. Define the issue and the criteria for judgment, then develop the case and address the strongest reasonable counterargument. Explain the argument’s scope and trade-offs. Distinguish value judgments from factual claims. Avoid personal attacks, straw-man arguments, and presenting a position as objective fact. Make the headline accurately reflect the argument without relying on provocation or exaggeration."
  },
  narrative: {
    name: { en: "Narrative Feature", zh: "叙事特写" },
    summary: { en: "Tell the story through sourced scenes, telling details and chronology.", zh: "用有出处的场景、细节与时间线，串起人物和事件。" },
    rules: "Style: Narrative feature. Use a clear story arc to help readers understand a person, event, or issue. Develop the narrative through sourced scenes, actions, details, and chronology, adding context and explanation at key points. Narrative technique must serve the facts: do not invent dialogue, scenes, thoughts, or chronology for dramatic effect. Balance storytelling passages with informative ones, and end by returning to the central theme or showing what remains unresolved or in progress."
  },
};

const mediaGuidance = "\n\nUse these editorial characteristics as high-level references. Do not reproduce the outlet’s distinctive wording, signature expressions, or specific articles.";
const mediaReferencePresets = {
  economist: {
    name: { en: "The Economist", zh: "经济学人" },
    summary: { en: "Examine the forces behind an event and its wider international significance.", zh: "从国际视角分析事件背后的力量，以及更广泛的政治和经济影响。" },
    rules: "Media reference: The Economist. Take an international perspective and place events in a broader political, economic, or social context. Make the argument clear and the reasoning compact. A measured, occasionally witty turn of phrase is acceptable, but evidence and restraint come first. Explain why the event matters, then examine its drivers, stakes, and possible consequences. Do not sacrifice accuracy to sound sharp." + mediaGuidance
  },
  nyt: {
    name: { en: "The New York Times", zh: "纽约时报" },
    summary: { en: "Connect reported scenes and people’s experiences to the broader story.", zh: "结合现场细节和多方经历，说明事件如何影响个人与机构。" },
    rules: "Media reference: The New York Times. Use clear storytelling for a broad readership, with attention to on-the-ground detail, people’s experiences, and multiple perspectives. Provide enough context for readers to understand how events affect individuals and institutions. Give the piece a well-paced structure and keep fact and interpretation distinct. Avoid sensational details and scene-setting that cannot be verified." + mediaGuidance
  },
  ft: {
    name: { en: "Financial Times", zh: "金融时报" },
    summary: { en: "Link markets, companies and policy using precise figures and comparisons.", zh: "联系市场、企业与政策，解释数据口径、比较基准和商业风险。" },
    rules: "Media reference: Financial Times. Use precise, restrained language with a high level of relevant information. Pay close attention to connections among the global economy, business, markets, and policy. Make data definitions and comparison baselines clear, and explain the commercial meaning and potential risks behind the numbers. Avoid slogan-like judgments and do not use jargon in place of explanation." + mediaGuidance
  },
  wsj: {
    name: { en: "The Wall Street Journal", zh: "华尔街日报" },
    summary: { en: "Follow a business development through firms, employees, investors and customers.", zh: "从企业和行业结构切入，追踪变化对员工、投资者及消费者的影响。" },
    rules: "Media reference: The Wall Street Journal. Give particular attention to companies, business, markets, and the effects of policy. Explain the relevant firms, industry structure, interests, and operating context. Support analysis with specific facts and data, and distinguish reporting from opinion. Show how a business development affects different groups, such as companies, investors, employees, or consumers. Do not reduce a market move to a single cause." + mediaGuidance
  },
  reuters: {
    name: { en: "Reuters", zh: "路透社" },
    summary: { en: "Put the news first, attribute claims precisely and include responses to disputes.", zh: "开篇直陈事实，准确标注消息来源，为争议提供背景和回应。" },
    rules: "Media reference: Reuters. Use concise, direct, fact-first news writing. State the most important information early and clearly attribute claims to their sources. Prefer neutral wording over vague qualifiers or unverified judgments. For disputed claims, provide necessary context or a response from relevant parties. Prioritize accuracy and readability." + mediaGuidance
  },
  ap: {
    name: { en: "Associated Press", zh: "美联社" },
    summary: { en: "Make the key facts and their public significance clear to a broad audience.", zh: "用易懂的语言呈现关键事实，以及它们对公众意味着什么。" },
    rules: "Media reference: Associated Press. Use direct, accessible news writing for a broad audience. Prioritize the key facts and their public significance; keep background concise and avoid unnecessary jargon or ornament. Attribute data, quotations, and claims accurately. Do not exaggerate an event through the headline or wording." + mediaGuidance
  },
  bloomberg: {
    name: { en: "Bloomberg", zh: "彭博社" },
    summary: { en: "Lead with the market development and the figures that explain its significance.", zh: "从市场或公司变动切入，以关键数字和行业背景说明其意义。" },
    rules: "Media reference: Bloomberg. Use a brisk, information-rich approach to business and financial reporting. Explain early what happened in the market or company, the key figures, and why they matter. Combine data with industry context and information from relevant parties to explain the change. Specify metric definitions and time periods. Do not attribute a price movement to a single factor without evidence or present market speculation as a firm conclusion." + mediaGuidance
  },
  bbc: {
    name: { en: "BBC", zh: "英国广播公司（BBC）" },
    summary: { en: "Explain events, competing claims and public impact for an international audience.", zh: "面向不同国家的读者，讲清事件经过、各方证据和公众影响。" },
    rules: "Media reference: BBC. Use clear, balanced public-service journalism that readers across countries can follow. Explain how events unfolded, the positions of relevant parties, and the effects on the public. Use plain language to clarify institutions and context. Represent competing positions and their evidence accurately; do not mistake giving equal space to both sides for assessing the strength of the evidence." + mediaGuidance
  },
  guardian: {
    name: { en: "The Guardian", zh: "卫报" },
    summary: { en: "Examine public-interest questions through affected communities and institutions.", zh: "从受影响群体的处境出发，审视权力关系和公共利益。" },
    rules: "Media reference: The Guardian. Pay attention to public interest, social impact, power relationships, and issues such as the environment. Show the circumstances of affected groups while scrutinizing claims from governments, institutions, and companies. Keep analysis of structural causes grounded in evidence and clearly label opinion. Do not let a moral position substitute for fact-checking." + mediaGuidance
  },
  atlantic: {
    name: { en: "The Atlantic", zh: "大西洋月刊" },
    summary: { en: "Develop a sustained argument through history, ideas and concrete examples.", zh: "从具体问题展开，以历史、观念和实例支撑深入论证。" },
    rules: "Media reference: The Atlantic. Favor in-depth explanation and sustained argument. Begin with a specific problem and gradually explore its intellectual, historical, or institutional context. Build a coherent structure and support claims with evidence. It is appropriate to test conventional explanations with a counterintuitive question, but keep abstract discussion readable through facts, examples, and clear reasoning." + mediaGuidance
  },
};

export const writingPresets = {...purposePresets,...mediaReferencePresets};
