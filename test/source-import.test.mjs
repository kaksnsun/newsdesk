import {test} from 'node:test';
import assert from 'node:assert/strict';
import {zipSync,strToU8} from 'fflate';
import {extractSource} from '../source-import.mjs';
const input=(name,bytes)=>({name,data:Buffer.from(bytes).toString('base64')});
test('PowerPoint extraction preserves slide order and text',async()=>{const bytes=zipSync({'ppt/slides/slide2.xml':strToU8('<p:sld xmlns:a="urn:a"><a:t>Second</a:t></p:sld>'),'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:a="urn:a"><a:t>First</a:t></p:sld>')});const result=await extractSource(input('slides.pptx',bytes));assert.match(result.text,/First[\s\S]*Second/);});
test('Word extraction reads document text',async()=>{const bytes=zipSync({'[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),'word/document.xml':strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Report notes</w:t></w:r></w:p></w:body></w:document>')});assert.equal((await extractSource(input('notes.docx',bytes))).text,'Report notes');});
test('empty and unsupported files fail instead of saving empty sources',async()=>{await assert.rejects(extractSource(input('empty.txt','')),/nonempty/);await assert.rejects(extractSource(input('data.exe','abc')),/Unsupported/);});
function tinyPDF(text){const stream=text?`BT /F1 14 Tf 50 700 Td (${text}) Tj ET`:'';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let pdf='%PDF-1.4\n';const offsets=[];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const start=Buffer.byteLength(pdf);return Buffer.from(pdf+'xref\n0 6\n0000000000 65535 f \n'+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);}
test('PDF import reads the text layer and explains when there is no selectable text',async()=>{
 const result=await extractSource(input('report.pdf',tinyPDF('Report evidence text.')));
 assert.match(result.text,/Report evidence/);
 await assert.rejects(extractSource(input('scan.pdf',tinyPDF(''))),/no selectable text/);
 await assert.rejects(extractSource(input('photo.png','image')),/Unsupported file/);
});
