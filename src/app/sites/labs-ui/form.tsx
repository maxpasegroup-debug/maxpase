"use client";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { enquiryAction,labsAction,changeLabsPinAction,type LabsState } from "./actions";
export function LocalInstant({name,value}:{name:string;value:string|null}){
  const [display,setDisplay]=useState(""),[instant,setInstant]=useState(value??"");
  useEffect(()=>{setInstant(value??"");if(!value){setDisplay("");return;}const d=new Date(value),pad=(n:number)=>String(n).padStart(2,"0");setDisplay(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);},[value]);
  return <><input type="hidden" name={name} value={instant}/><input type="datetime-local" value={display} onChange={event=>{setDisplay(event.target.value);const date=event.target.value?new Date(event.target.value):null;setInstant(date&&!Number.isNaN(date.getTime())?date.toISOString():"");}}/></>;
}
export function LabsForm({children,kind="WORK",label,actionName,id,version,reference,confirm}:{children:ReactNode;kind?:"WORK"|"ENQUIRY"|"PIN";label:string;actionName?:string;id?:string;version?:number;reference?:string;confirm?:string}){
  const [state,action,pending]=useActionState(kind==="ENQUIRY"?enquiryAction:kind==="PIN"?changeLabsPinAction:labsAction,{} as LabsState);
  return <form action={async form=>{for(const key of ["nextFollowUp","expiresAt","targetDate","dueDate"]){const value=form.get(key);if(typeof value==="string"&&value&&!value.endsWith("Z")){const date=new Date(value);if(!Number.isNaN(date.getTime()))form.set(key,date.toISOString());}}await action(form);}} className="al-form" aria-busy={pending} onSubmit={event=>{if(confirm&&!window.confirm(confirm))event.preventDefault();}}>
    {actionName&&<input type="hidden" name="action" value={actionName}/>}<input type="hidden" name="id" value={id??""}/><input type="hidden" name="version" value={version??0}/><input type="hidden" name="reference" value={reference??""}/>{children}
    {state.error&&<p role="alert" className="error">{state.error}</p>}{state.message&&<p role="status">{state.message}</p>}<button className="al-button" disabled={pending}>{pending?"Saving...":label}<ArrowRight size={17}/></button>
  </form>;
}
