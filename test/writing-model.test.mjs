import {test} from 'node:test';import assert from 'node:assert/strict';
import {migrateProject,locateAnnotation,splitGeneratedArticle,selectedSources,sourcesForPrompt} from '../public/writing-model.js';
test('migration keeps stable source numbers and moves imported articles out of research',()=>{const project={article:'Legacy text',sources:[{id:'a',name:'Paste',text:'A'},{id:'b',name:'draft.md',text:'Draft',kind:'article'},{id:'c',name:'Site',url:'https://example.com',text:'C'}]};migrateProject(project);assert.deepEqual(project.sources.map(s=>s.number),[1,2]);assert.equal(project.sources[0].sourceKind,'paste');assert.equal(project.sources[1].sourceKind,'link');assert.equal(project.importedArticles.length,1);assert.equal(project.writings[0].article,'Legacy text');migrateProject(project);assert.equal(project.importedArticles.length,1);assert.deepEqual(project.sources.map(s=>s.number),[1,2]);assert.equal(project.writings.length,1)});
test('ambiguous annotation text never replaces an arbitrary duplicate',()=>{assert.equal(locateAnnotation('Repeated. Repeated.',{quote:'Repeated.'}),null);assert.deepEqual(locateAnnotation('Prefix Repeated. End',{quote:'Repeated.'}),{start:7,end:16});});

test('headline extraction accepts explicit headlines and never consumes an ordinary lead',()=>{assert.deepEqual(splitGeneratedArticle('# Headline\n\nBody'),{title:'Headline',body:'Body'});assert.deepEqual(splitGeneratedArticle('标题：新闻标题\n正文'),{title:'新闻标题',body:'正文'});assert.deepEqual(splitGeneratedArticle('The first sentence.\n\nThe next paragraph.'),{title:'',body:'The first sentence.\n\nThe next paragraph.'})});

test('legacy cross-project selections are excluded from prompts and removed during migration',()=>{
 const writing={id:'draft',selectedSourceIds:['local','external','in-trash']};
 const project={sources:[{id:'local',number:4,name:'Notes',text:'Local evidence'}],deletedSources:[{id:'in-trash'}],writings:[writing]};
 assert.deepEqual(selectedSources(project,writing).map(source=>source.id),['local']);
 assert.equal(sourcesForPrompt(project,writing),'[Source #4: Notes]\nLocal evidence');
 migrateProject(project);
 assert.deepEqual(writing.selectedSourceIds,['local','in-trash']);
});
