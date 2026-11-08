// Dependency-free DOM harness. No browser launch or HTTP server.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const decode=s=>s.replace(/&(?:amp|lt|gt|quot|#39);/g,c=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[c]));
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.attrs={};this.handlers={};this.value='';this.style={};this._text='';this.dataset=new Proxy({},{get:(_,key)=>this.attrs['data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())],set:(_,key,value)=>{this.attrs['data-'+key]=String(value);return true}});this.classList={contains:c=>this.className.split(/\s+/).includes(c),toggle:(c,on)=>{const set=new Set(this.className.split(/\s+/).filter(Boolean));if(on===undefined)on=!set.has(c);if(on)set.add(c);else set.delete(c);this.className=[...set].join(' ');return on}};}
 set className(v){this.attrs.class=v}get className(){return this.attrs.class||''}
 setAttribute(k,v){this.attrs[k]=String(v)}getAttribute(k){return this.attrs[k]}
 appendChild(el){el.parent=this;this.children.push(el);return el}
 addEventListener(type,fn){(this.handlers[type]??=[]).push(fn)}
 fire(type,props={}){for(const fn of this.handlers[type]||[])fn({target:this,preventDefault(){},...props})}
 set textContent(v){this.children=[];this._text=String(v)}get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
 set innerHTML(v){this.children=[];this._text='';parse(v,this)}
 matches(selector){if(selector.startsWith('.'))return this.classList.contains(selector.slice(1));if(selector.startsWith('['))return selector.slice(1,-1) in this.attrs;if(selector.startsWith('#'))return this.attrs.id===selector.slice(1);return this.tagName===selector}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 closest(s){return this.matches(s)?this:this.parent?.closest(s)}
 getBoundingClientRect(){return {width:800,height:740}}setPointerCapture(){}
}
function parse(markup,parent){const stack=[parent];const tokens=markup.match(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>|<[^>]+>|[^<]+/g)||[];for(const token of tokens){if(/^<!/.test(token))continue;if(/^<\//.test(token)){stack.pop();continue}if(token[0]==='<'){const tag=token.match(/^<([\w-]+)/)?.[1];if(!tag)continue;const el=new Element(tag);const head=token.slice(0,token.indexOf('>')+1);for(const m of head.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g))el.setAttribute(m[1],decode(m[2]));stack.at(-1).appendChild(el);if(tag==='script'||tag==='style'){el.textContent=token.slice(token.indexOf('>')+1,token.lastIndexOf('</'));continue}if(!['meta','input','br','link','hr'].includes(tag)&&!token.endsWith('/>'))stack.push(el)}else {const text=new Element('#text');text.textContent=decode(token);stack.at(-1).appendChild(text)}}}
const root=new Element('document');parse(html,root);
const document={getElementById:id=>root.querySelector('#'+id),querySelectorAll:s=>root.querySelectorAll(s),createElement:tag=>new Element(tag),createElementNS:(_,tag)=>new Element(tag)};
const context={document,console};vm.createContext(context);
const scripts=root.querySelectorAll('script').filter(el=>el.getAttribute('type')!=='application/json');
for(const script of scripts)vm.runInContext(script.textContent,context,{filename:'index.html',timeout:3000});
const $=id=>document.getElementById(id),nodes=root.querySelectorAll('.node'),edges=root.querySelectorAll('.edge');
const data=JSON.parse($('graph-data').textContent);
assert(nodes.length>=25);assert(edges.length>=15);assert.equal(new Set(nodes.map(n=>n.dataset.type)).size,4);
for(const edge of edges){assert(nodes.some(n=>n.dataset.id===edge.dataset.source));assert(nodes.some(n=>n.dataset.id===edge.dataset.target));for(const key of ['x1','y1','x2','y2'])assert(Number.isFinite(+edge.getAttribute(key)))}
assert.equal(nodes.filter(n=>n.classList.contains('hidden')).length,0);
for(const node of nodes){node.fire('click');assert($('detail-panel').textContent.includes(node.dataset.path));assert($('detail-panel').querySelector('pre').textContent.trim().length>0);const expected=new Set(data.edges.flatMap(e=>e.source===node.dataset.id?[e.target]:e.target===node.dataset.id?[e.source]:[]));for(const other of nodes)assert.equal(other.classList.contains('highlight'),expected.has(other.dataset.id));}
for(const query of ['LIB/','route','INDEX.JS','zz-no-such-file']){$('search').value=query;$('search').fire('input');for(const node of nodes)assert.equal(!node.classList.contains('hidden'),node.dataset.path.toLowerCase().includes(query.toLowerCase()))}
assert(!$('empty-message').classList.contains('hidden'));$('clear-filters').fire('click');assert($('empty-message').classList.contains('hidden'));
for(const legend of root.querySelectorAll('[data-category]')){legend.fire('click');for(const node of nodes)assert.equal(node.classList.contains('hidden'),node.dataset.type===legend.dataset.category);legend.fire('click');assert(nodes.every(n=>!n.classList.contains('hidden')))}
const middleware=root.querySelectorAll('[data-category]').find(n=>n.dataset.category==='middleware');middleware.fire('click');$('search').value='INDEX';$('search').fire('input');for(const node of nodes)assert.equal(!node.classList.contains('hidden'),node.dataset.type!=='middleware'&&node.dataset.path.toLowerCase().includes('index'));$('clear-filters').fire('click');
nodes.find(n=>n.dataset.id==='lib/express.js').fire('click');const connection=$('detail-panel').querySelector('[data-file]');const target=connection.dataset.file;connection.fire('click');assert($('detail-panel').textContent.includes(target));
$('zoom-in').fire('click');assert.equal($('zoom-value').textContent,'120%');$('zoom-out').fire('click');assert.equal($('zoom-value').textContent,'100%');$('graph').fire('pointerdown',{clientX:10,clientY:10,pointerId:1});$('graph').fire('pointermove',{clientX:40,clientY:50});$('graph').fire('pointerup');assert($('viewport').getAttribute('transform').includes('30,40'));$('fit').fire('click');assert($('viewport').getAttribute('transform').includes('0,0'));
assert(/expressjs\/express.*[a-f0-9]{7}/.test($('source-info').textContent));
for(const m of html.matchAll(/\b(?:src|href)="([^"]+)"/g)){const ref=m[1];if(!/^(https?:|data:|#)/.test(ref))assert(fs.existsSync(path.join(__dirname,ref)),`Missing asset ${ref}`)}
const initialText=html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'').trim();assert(initialText.length>10);
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(scripts.map(s=>s.textContent).join('')));
// Capture the initialized graph geometry for inspection without a browser process.
fs.writeFileSync('/tmp/floorplan-layout.json',JSON.stringify(nodes.map(n=>({path:n.dataset.path,type:n.dataset.type,transform:n.getAttribute('transform')})),null,2));
console.log(`PASS: opened index.html in DOM harness; ${nodes.length} nodes, ${edges.length} connected edges, 4 categories; every node click, snippets, exact neighbor highlighting, case-insensitive search, category toggles, combined filters, empty/reset state, inspector navigation, zoom/pan/reset, source SHA, local asset resolution, initial text, and no runtime network APIs.`);
