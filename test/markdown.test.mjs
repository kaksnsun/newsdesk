import {test} from 'node:test';
import assert from 'node:assert/strict';
import {markdownToText} from '../public/markdown.js';
test('converts headings, nested emphasis, links, quotes, task lists and tables',()=>{const text=markdownToText('# 标题\n\n**重要**与*说明*，访问[来源](https://example.com)。\n\n> 引语\n\n- [x] 核实\n- [ ] 待办\n\n| 名称 | 数字 |\n|---|---|\n| A | 10 |');assert.match(text,/标题/);assert.ok(!text.includes('**'));assert.match(text,/来源 \(https:\/\/example.com\)/);assert.match(text,/☑ 核实/);assert.match(text,/名称 · 数字/);assert.match(text,/A · 10/)});
test('preserves code and ordinary numbers, asterisks and underscores',()=>{assert.equal(markdownToText('价格 2 * 3，a_b_c\n\n```js\nconst n = "**literal**";\n```'), '价格 2 * 3，a_b_c\n\nconst n = "**literal**";')});
test('nested lists start on their own indented lines',()=>{const result=markdownToText('- Parent\n  - Child\n  - Other\n- Next');assert.match(result,/Parent\n\s+• Child/);assert.match(result,/\n• Next/)});
