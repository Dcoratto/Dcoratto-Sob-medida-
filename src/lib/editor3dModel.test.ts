import {test} from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeDrawing, DEFAULT_COUNTERTOP, deserializeCountertop, experimentalArea, hasPendingDrawing, mmToCm, mmToScene, parseCentimeters, serializeCountertop, solidDimensions, topOutline, validateCountertop} from './editor3dModel';
test('centimetres and integer millimetres preserve controlled precision',()=>{
  assert.deepEqual(parseCentimeters('250','lengthMm'),{mm:2500});
  assert.deepEqual(parseCentimeters('60,1','depthMm'),{mm:601});
  assert.deepEqual(parseCentimeters('2.5','thicknessMm'),{mm:25});
  assert.equal(mmToCm(601),60.1);assert.equal(mmToScene(2500),2.5);
  for(const text of ['','2,','-1','0','NaN','Infinity','1e3','12.55','601'])assert.ok(parseCentimeters(text,'lengthMm').error);
});
test('the 2D X/Z outline and 3D X/Y/Z solid derive from one physical model',()=>{
  assert.equal(experimentalArea(DEFAULT_COUNTERTOP),1.5);
  assert.deepEqual(topOutline(DEFAULT_COUNTERTOP),{width:2500,height:600});
  assert.deepEqual(solidDimensions(DEFAULT_COUNTERTOP),[2.5,.02,.6]);
  const changed={...DEFAULT_COUNTERTOP,dimensions:{lengthMm:3000,depthMm:800,thicknessMm:30}};
  assert.equal(experimentalArea(changed),2.4);assert.equal(topOutline(changed).width,solidDimensions(changed)[0]*1000);
});
test('schema roundtrip rejects unknown shapes, extra fields, malformed JSON and unsafe bounds',()=>{
  assert.deepEqual(deserializeCountertop(serializeCountertop(DEFAULT_COUNTERTOP)),DEFAULT_COUNTERTOP);
  for(const bad of [null,[],{...DEFAULT_COUNTERTOP,schemaVersion:2},{...DEFAULT_COUNTERTOP,type:'L'},{...DEFAULT_COUNTERTOP,price:100}])assert.throws(()=>validateCountertop(bad));
  for(const lengthMm of [0,-1,99,6001,NaN,Infinity,100.5,'2500'])assert.throws(()=>validateCountertop({...DEFAULT_COUNTERTOP,dimensions:{...DEFAULT_COUNTERTOP.dimensions,lengthMm}}));
  assert.throws(()=>deserializeCountertop('{'));assert.throws(()=>deserializeCountertop(' '.repeat(1025)));
  assert.doesNotThrow(()=>validateCountertop({...DEFAULT_COUNTERTOP,dimensions:{lengthMm:100,depthMm:100,thicknessMm:10}}));
  assert.doesNotThrow(()=>validateCountertop({...DEFAULT_COUNTERTOP,dimensions:{lengthMm:6000,depthMm:2500,thicknessMm:200}}));
});
test('acknowledging a save leaves later edits pending',()=>{
  const current={...DEFAULT_COUNTERTOP,dimensions:{...DEFAULT_COUNTERTOP.dimensions,lengthMm:3000}};
  const acknowledged=acknowledgeDrawing(DEFAULT_COUNTERTOP,current);
  assert.equal(acknowledged.pending,true);assert.equal(hasPendingDrawing(current,acknowledged.saved),true);
  assert.equal(hasPendingDrawing(DEFAULT_COUNTERTOP,acknowledged.saved),false);
});
