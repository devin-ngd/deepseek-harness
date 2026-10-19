/** Fixed source-offload/form fixture shared by native rounds; automatic submission exists only for the prepared next-round service owner. */
import { mobilePublications } from './mobile-publication.ts'
import { NATIVE_SECURITY_PROGRAM } from '../src/native-security-program.ts'

/** @param automaticSubmit - explicitly selected test-owned form submission; completed fixed actions never resubmit after remount. @returns immutable authored publications using the same four replay responses. */
export function nativeAcceptancePublications(automaticSubmit: boolean) {
  return mobilePublications.map((content,index)=>index===0?{...content,
    html:content.html.replace('phase5-desktop','phase11-desktop')+'<button id="security-run">guest isolation</button><pre id="security-result"></pre><output id="dedupe-result"></output>'+'<!-- fixed source offload verification -->'.repeat(180),
    css:content.css+'#security-run{position:fixed;right:2px;bottom:2px;z-index:10}#security-result{position:fixed;top:0;left:0;background:#151515;color:white;font-size:10px;max-height:180px;overflow:auto;pointer-events:none;z-index:11}',
    js:content.js.replace('await rich.submit(values,{actionId:"phase3-action"})','const a=rich.submit(values,{actionId:"phase3-action"}),b=rich.submit(values,{actionId:"phase3-action"});await a;await b;document.querySelector("#dedupe-result").textContent="duplicate-action:both-settled"')+';document.querySelector("input[name=title]").value="Final mobile input";document.querySelector("input[name=count]").value="7";'+NATIVE_SECURITY_PROGRAM+(automaticSubmit?';let submitted=false;rich.onState(s=>{if(submitted||s.actions.some(a=>a.actionId==="phase3-action"))return;submitted=true;queueMicrotask(()=>document.querySelector("form").requestSubmit())});':''),
  }:content)
}
