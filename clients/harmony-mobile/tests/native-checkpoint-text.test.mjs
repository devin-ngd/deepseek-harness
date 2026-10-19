/** Bounded viewport observation must retain the exact native checkpoint criterion. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { observeNativeCheckpointText } from '../scripts/native-window-policy.mjs'
const expected='DSH read checkpoint unique',list={attributes:{type:'List',visible:'true',enabled:'true',scrollable:'true',bounds:'[48,951][1032,1761]'}}
const text=value=>({attributes:{type:'Text',text:value,originalText:value,visible:'true'}})
const policy={budget:{requireTime(){}},maxScrolls:4,pauseMs:1}
test('an exact lazy-list Text after scrolling qualifies with retained gesture evidence',async()=>{
  const gestures=[];let reads=0
  const value=await observeNativeCheckpointText(expected,{async layout(){return ++reads===1?[list,text('other')]:[list,text(expected)]},async swipe(...args){gestures.push(args)},async sleep(){}},policy)
  assert.equal(value.attributes.text,expected);assert.equal(value.scrolls,1);assert.deepEqual(gestures,[[540,1731,540,981]])
})
test('wrong text never qualifies and ambiguous or invalid viewport stops without a gesture',async()=>{
  let swipes=0
  await assert.rejects(observeNativeCheckpointText(expected,{async layout(){return[list,text('wrong')]},async swipe(){swipes++},async sleep(){}},{...policy,maxScrolls:2}),error=>error.code==='checkpoint-text-not-observed')
  assert.equal(swipes,2)
  for(const nodes of [[list,list],[{attributes:{...list.attributes,bounds:'[0,0][10,20]'}}]])await assert.rejects(observeNativeCheckpointText(expected,{async layout(){return nodes},async swipe(){throw Error('No gesture allowed')},async sleep(){}},policy),error=>['checkpoint-list-not-confirmed','checkpoint-list-bounds-invalid'].includes(error.code))
})
